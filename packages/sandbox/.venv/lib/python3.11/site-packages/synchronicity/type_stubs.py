"""
Improvement Ideas:
* Extract this into its own package, not linked to synchronicity, but with good extension plugs?
* Don't use the wrapped synchronicity types directly, and instead emit stubs based on the root
  implementation types directly (but translated to blocking).
* Let synchronicity emit actual function bodies, to avoid runtime wrapping altogether
"""

import collections
import collections.abc
import contextlib
import contextvars
import enum
import importlib
import inspect
import sys
import textwrap
import types
import typing
import warnings
from inspect import get_annotations
from logging import getLogger
from pathlib import Path
from typing import TypeVar
from unittest import mock

import sigtools.specifiers  # type: ignore
import typing_extensions
from sigtools._signatures import EmptyAnnotation, UpgradedAnnotation, UpgradedParameter  # type: ignore

import synchronicity
from synchronicity import combined_types, overload_tracking
from synchronicity.annotations import TYPE_CHECKING_OVERRIDES, evaluated_annotation
from synchronicity.async_wrap import is_coroutine_function_follow_wrapped
from synchronicity.interface import Interface
from synchronicity.synchronizer import (
    SYNCHRONIZER_ATTR,
    TARGET_INTERFACE_ATTR,
    FunctionWithAio,
    MethodWithAio,
    classproperty,
)

logger = getLogger(__name__)


def safe_get_module(obj: typing.Any) -> typing.Optional[str]:
    """Handles some special cases where obj.__module__ isn't correct or ugly

    e.g. in Python 3.8 contextvars.ContextVar.__module__ == "builtins"
    and in Python 3.11 contextvars.ContextVar.__module__ == "_contextvars"
    and in emitted code it should *preferably* be "contextvars"
    """
    if obj == contextvars.ContextVar:
        return "contextvars"

    if not hasattr(obj, "__module__"):
        return None

    if obj.__module__ in ("_contextvars", "_asyncio"):
        return obj.__module__[1:]  # strip leading underscore

    if obj.__module__ == "pathlib._local":
        # in newer versions of Python (known: 3.13)
        # some pathlib classes live in pathlib._local
        return "pathlib"

    try:
        if (obj.__module__, obj.__name__) == ("typing", "Concatenate"):
            # typing_extensions.Concatenate forwards typing.Concatenate if
            # available, but we still want to emit typing_extensions to be
            # backwards compatible
            return "typing_extensions"
    except Exception:
        pass

    return obj.__module__


def generic_copy_with_args(specific_type, new_args):
    origin = get_origin(specific_type)
    if hasattr(specific_type, "copy_with") and origin not in (typing.Callable, collections.abc.Callable):
        # not strictly necessary, but this makes the type stubs
        # preserve generic alias names when possible, e.g. using `typing.Iterator`
        # instead of changing it into `collections.abc.Iterator`
        return specific_type.copy_with(new_args)

    return origin[new_args]


def add_prefix_arg(arg_name, remove_args=0):
    def inject_arg_func(sig: inspect.Signature):
        parameters = list(sig.parameters.values())
        return sig.replace(
            parameters=[
                UpgradedParameter(arg_name, inspect.Parameter.POSITIONAL_ONLY),
                *parameters[remove_args:],
            ]
        )

    return inject_arg_func


def replace_type_vars(replacement_dict: typing.Dict[type, type]):
    def _replace_type_vars_rec(tp: typing.Type[typing.Any]):
        origin = get_origin(tp)
        args = safe_get_args(tp)

        if isinstance(tp, (typing_extensions.ParamSpecArgs, typing_extensions.ParamSpecKwargs)):
            new_origin_type_var = _replace_type_vars_rec(origin)
            return type(tp)(new_origin_type_var)

        if type(tp) is list:  # typically first argument to typing.Callable
            # intentionally not using isinstance, since ParamSpec is a subclass of list in Python 3.9
            return [_replace_type_vars_rec(arg) for arg in tp]

        if tp in replacement_dict:
            return replacement_dict[tp]

        if origin:
            newargs = tuple(_replace_type_vars_rec(a) for a in args)
            return generic_copy_with_args(tp, newargs)

        return tp

    def _replace_type_vars_in_sig(sig: inspect.Signature):
        parameters = [p.replace(annotation=_replace_type_vars_rec(p.annotation)) for p in sig.parameters.values()]
        return sig.replace(
            parameters=parameters,
            return_annotation=_replace_type_vars_rec(sig.return_annotation),
        )

    return _replace_type_vars_in_sig


def get_origin(annotation: type):
    if sys.version_info < (3, 10):
        # typing.get_origin returns None for ParamSpecArgs on <= Python3.9
        return getattr(annotation, "__origin__", None)

    origin = typing.get_origin(annotation)
    if origin is types.UnionType:
        # origin would be types.UnionType for unions, but it's more practical to use typing.Union
        # since that can be used to create new types, e.g. typing.Union[...]
        return typing.Union
    return origin


def _get_type_vars(typ, synchronizer, home_module):
    origin = get_origin(typ)
    ret = set()
    if isinstance(typ, typing.TypeVar):
        # check if it's translated (due to bounds= attributes etc.)
        typ = synchronizer._translate_out(typ)
        ret.add(typ)
    elif isinstance(typ, (typing_extensions.ParamSpecArgs, typing_extensions.ParamSpecKwargs)):
        param_spec = origin
        param_spec = synchronizer._translate_out(param_spec)
        ret.add(param_spec)
    elif origin:
        for arg in safe_get_args(typ):
            ret |= _get_type_vars(arg, synchronizer, home_module)
    else:
        # Copied string annotation handling from StubEmitter.translate_annotations - TODO: unify?
        # The reason it cant be used directly is that this method should return the original type params
        # and not translated values
        if isinstance(typ, typing.ForwardRef):  # TypeVars wrap their arguments as ForwardRefs (sometimes?)
            if hasattr(typ, "__forward_module__") and typ.__forward_module__ is not None:
                return ret
            typ = typ.__forward_arg__
        if isinstance(typ, str):
            try:
                typ = evaluated_annotation(typ, declaration_module=home_module)
            except Exception:
                logger.exception(f"Error when evaluating {typ} in {home_module}. Falling back to string typ")
                return ret
            return _get_type_vars(typ, synchronizer, home_module)
    return ret


def _get_func_type_vars(func, synchronizer: synchronicity.Synchronizer) -> typing.Set[type]:
    ret = set()
    home_module = safe_get_module(func)
    annotations = get_annotations(func)
    for typ in annotations.values():
        ret |= _get_type_vars(typ, synchronizer, home_module)
    return ret


def _func_uses_self(func) -> bool:
    """Check if a function's annotations use typing_extensions.Self"""

    def _contains_self(typ) -> bool:
        if typ is typing_extensions.Self:
            return True
        origin = get_origin(typ)
        if origin:
            for arg in safe_get_args(typ):
                if _contains_self(arg):
                    return True
        return False

    annotations = get_annotations(func)
    for typ in annotations.values():
        if _contains_self(typ):
            return True
    return False


def safe_get_args(annotation):
    # "polyfill" of Python 3.10+ typing.get_args() behavior of
    # not putting ParamSpec and Ellipsis in a list when used as first argument to a Callable
    # This can be removed if we drop support for *generating type stubs using Python <=3.9*
    args = typing.get_args(annotation)
    if sys.version_info[:2] <= (3, 9) and typing.get_origin(annotation) == collections.abc.Callable:
        if (
            args
            and type(args[0]) is list
            and args[0]
            and isinstance(args[0][0], (typing_extensions.ParamSpec, type(...)))
        ):
            args = (args[0][0],) + args[1:]

    return args


def get_specific_generic_name(annotation):
    """get the name of the generic type of a "specific" type (with args)
    e.g.
    >>> get_specific_generic_name(typing.List[str])
    "List"
    """
    if hasattr(annotation, "__name__"):
        # this works on new pythons
        return annotation.__name__
    elif hasattr(annotation, "_name") and annotation._name is not None:
        # fallback for older Python (at least 3.8)
        return annotation._name
    else:
        # also an old python
        return get_specific_generic_name(annotation.__origin__)


class StubEmitter:
    def __init__(self, target_module):
        self.target_module = target_module
        self.imports = set()
        self.parts = []
        self._indentation = "    "
        self.global_types = set()
        self.referenced_global_types = set()
        self._typevar_inner_replacements = {}

    @classmethod
    def from_module(cls, module):
        emitter = cls(module.__name__)
        explicit_members = module.__dict__.get("__all__", [])
        for entity_name, entity in module.__dict__.copy().items():
            if (
                hasattr(entity, "__module__")
                and safe_get_module(entity) != module.__name__
                and entity_name not in explicit_members
                and typing.get_origin(entity) is not typing.Literal
            ):
                continue  # skip imported stuff, unless it's explicitly in __all__
            if inspect.isclass(entity):
                emitter.add_class(entity, entity_name)
            elif inspect.isfunction(entity) or isinstance(entity, FunctionWithAio):
                emitter.add_function(entity, entity_name)
            elif isinstance(entity, (typing.TypeVar, typing_extensions.ParamSpec)):
                emitter.add_type_var(entity, entity_name)
            elif hasattr(entity, "__class__") and safe_get_module(entity.__class__) == module.__name__:
                # instances of stuff
                emitter.add_variable(entity.__class__, entity_name)
            elif typing.get_origin(entity) is typing.Literal:
                emitter.add_literal(entity, entity_name)

        for varname, annotation in getattr(module, "__annotations__", {}).items():
            emitter.add_variable(annotation, varname)

        return emitter

    def add_variable(self, annotation, name):
        # TODO: evaluate string annotations
        self.parts.append(self._get_var_annotation(name, annotation))

    def add_literal(self, entity, name):
        self.parts.append(f"{name} = {str(entity)}")

    def add_function(self, func, name, indentation_level=0):
        # adds function source code to module
        if isinstance(func, FunctionWithAio):
            # this is a synchronicity-emitted replacement function/method for an originally async function
            self.parts.append(self._get_dual_function_source(func, name, indentation_level))
        else:
            self.parts.append(self._get_function_source_with_overloads(func, name, indentation_level))

    def _get_translated_class_bases(self, cls):
        bases = []
        for b in cls.__dict__.get("__orig_bases__", cls.__bases__):
            bases.append(self._translate_global_annotation(b, cls))
        return bases

    def add_class(self, cls, name) -> None:
        self.global_types.add(name)

        if issubclass(cls, enum.Enum):
            # Do not translate Enum classes.
            self.imports.add("enum")
            self.parts.append(inspect.getsource(cls))
            return

        body_indent_level = 1
        body_indent = self._indent(body_indent_level)

        bases = []
        generic_type_vars: typing.Set[type] = set()
        for b in self._get_translated_class_bases(cls):
            if b is not object:
                bases.append(self._formatannotation(b))
            if get_origin(b) == typing.Generic:
                generic_type_vars |= {a for a in b.__args__}

        bases_str = "" if not bases else "(" + ", ".join(bases) + ")"
        decl = f"class {name}{bases_str}:"
        class_docstring = self._get_docstring(cls, body_indent)

        var_annotations = []
        methods = []

        annotations = get_annotations(cls)
        annotations = {k: self._translate_global_annotation(annotation, cls) for k, annotation in annotations.items()}

        for varname, annotation in annotations.items():
            var_annotations.append(f"{body_indent}{self._get_var_annotation(varname, annotation)}")
        if var_annotations:
            var_annotations.append("")  # formatting ocd - add an extra newline after var annotations

        for entity_name, entity in cls.__dict__.items():
            if inspect.isfunction(entity):
                methods.append(self._get_function_source_with_overloads(entity, entity_name, body_indent_level))

            elif isinstance(entity, classmethod):
                fn_source = self._get_function_source_with_overloads(entity.__func__, entity_name, body_indent_level)
                methods.append(f"{body_indent}@classmethod\n{fn_source}")

            elif isinstance(entity, staticmethod):
                fn_source = self._get_function_source_with_overloads(entity.__func__, entity_name, body_indent_level)
                methods.append(f"{body_indent}@staticmethod\n{fn_source}")

            elif isinstance(entity, property):
                fn_source = self._get_function_source_with_overloads(entity.fget, entity_name, body_indent_level)
                methods.append(f"{body_indent}@property\n{fn_source}")

                if entity.fset:
                    fn_source = self._get_function_source_with_overloads(entity.fset, entity_name, body_indent_level)
                    methods.append(f"{body_indent}@{entity_name}.setter\n{fn_source}")

                if entity.fdel:
                    fn_source = self._get_function_source_with_overloads(entity.fdel, entity_name, body_indent_level)
                    methods.append(f"{body_indent}@{entity_name}.deleter\n{fn_source}")

            elif isinstance(entity, classproperty):
                fn_source = self._get_function_source_with_overloads(entity.fget, entity_name, body_indent_level)
                methods.append(f"{body_indent}@synchronicity.classproperty\n{fn_source}")
                self.imports.add("synchronicity")

            elif isinstance(entity, FunctionWithAio):
                # Note: FunctionWithAio is used for staticmethods
                methods.append(
                    self._get_dual_function_source(
                        entity,
                        entity_name,
                        body_indent_level,
                        parent_generic_type_vars=generic_type_vars,
                        is_class_member=True,
                    )
                )
            elif isinstance(entity, MethodWithAio):
                src = self._get_dual_function_source(
                    entity,
                    entity_name,
                    body_indent_level,
                    parent_generic_type_vars=generic_type_vars,
                    is_class_member=True,
                )
                methods.append(src)

        padding = [] if var_annotations or methods else [f"{body_indent}..."]
        self.parts.append(
            "\n".join(
                [
                    decl,
                    class_docstring,
                    *var_annotations,
                    *methods,
                    *padding,
                ]
            )
        )

    def _get_dual_function_source(
        self,
        entity: typing.Union[MethodWithAio, FunctionWithAio],
        entity_name,
        body_indent_level,
        parent_generic_type_vars: typing.Set[type] = set(),  # if a method of a Generic class - the set of type vars
        is_class_member: bool = False,  # whether this is a member of a class (vs module-level)
    ) -> str:
        # Determine if this is a class-level attribute (staticmethod or classmethod within a class)
        is_class_level = is_class_member and (
            isinstance(entity, FunctionWithAio) or (isinstance(entity, MethodWithAio) and entity._is_classmethod)
        )

        if isinstance(entity, FunctionWithAio):
            transform_signature = add_prefix_arg(
                "self"
            )  # signature is moved into a protocol class, so we need a self where there previously was none
        else:
            # For methods (instance or class), the descriptor binds self/cls,
            # so we remove it and add self for the Protocol
            transform_signature = add_prefix_arg("self", 1)
        # Emits type stub for a "dual" function that is both callable and has an .aio callable with an async version
        # Currently this is emitted as a typing.Protocol declaration + instance with a __call__ and aio method
        self.imports.add("typing_extensions")
        # Synchronicity specific blocking + async method
        body_indent = self._indent(body_indent_level)

        (
            typevar_signature_transform,
            parent_type_var_names_spec,
            protocol_declaration_type_var_spec,
        ) = self._prepare_method_generic_type_vars(entity, parent_generic_type_vars)

        def final_transform_signature(sig):
            return typevar_signature_transform(transform_signature(sig))

        # create an inline protocol type, inlining both the blocking and async interfaces:
        blocking_func_source = self._get_function_source_with_overloads(
            entity._func,
            "__call__",
            body_indent_level + 1,
            transform_signature=final_transform_signature,
        )
        aio_func_source = self._get_function_source_with_overloads(
            entity._aio_func,
            "aio",
            body_indent_level + 1,
            transform_signature=final_transform_signature,
        )

        # For class-level attributes (staticmethod/classmethod), wrap in ClassVar
        attr_type = f"__{entity_name}_spec{parent_type_var_names_spec}"
        if is_class_level:
            self.imports.add("typing")
            attr_annotation = f"typing.ClassVar[{attr_type}]"
        else:
            attr_annotation = attr_type

        protocol_attr = f"""\
{body_indent}class __{entity_name}_spec(typing_extensions.Protocol{protocol_declaration_type_var_spec}):
{blocking_func_source}
{aio_func_source}
{body_indent}{entity_name}: {attr_annotation}
"""

        return protocol_attr

    def _prepare_method_generic_type_vars(self, entity, parent_generic_type_vars):
        # Check any Generic TypeVar/ParamSpec used in the class x method, in order to
        # create a new type var for the protocol itself, since a "namespaced class" can't use the
        # generic type vars of its "parent class" directly. This will roughly translate to:
        # T = TypeVar("T")
        # T_INNER = TypeVar("T_INNER")
        # class Foo(Generic[T]):
        #     class Method(typing.Protocol[T_INNER]):
        #         def __call__(self, t: T_INNER):
        #             ...
        #
        #     method: Method[T]
        func_type_vars = _get_func_type_vars(entity._func, entity._synchronizer)
        typevar_overlap = parent_generic_type_vars & func_type_vars

        for tvar in typevar_overlap:
            if tvar in self._typevar_inner_replacements:
                continue
            replacement_typevar_name = tvar.__name__ + "_INNER"
            if isinstance(tvar, typing_extensions.ParamSpec):
                new_tvar = typing_extensions.ParamSpec(replacement_typevar_name)  # type: ignore
            else:
                new_tvar = typing.TypeVar(replacement_typevar_name, covariant=True)  # type: ignore
            new_tvar.__module__ = self.target_module  # avoid referencing synchronicity.type_stubs
            self._typevar_inner_replacements[tvar] = new_tvar
            self.add_type_var(new_tvar, replacement_typevar_name)  # type: ignore

        extra_instance_args = []
        extra_declaration_args = []

        if isinstance(entity, MethodWithAio):
            # support for typing.Self (which would otherwise reference the protocol class)
            # Only add SUPERSELF if the method actually uses Self in its signature
            uses_self = _func_uses_self(entity._func) or _func_uses_self(entity._aio_func)

            if uses_self:
                superself_name = "SUPERSELF"
                superself_var = typing.TypeVar(superself_name, covariant=True)  # type: ignore
                superself_var.__module__ = self.target_module
                self.add_type_var(superself_var, superself_name)
                self._typevar_inner_replacements[typing_extensions.Self] = superself_var
                self.imports.add("typing_extensions")
                extra_instance_args = ["typing_extensions.Self"]
                extra_declaration_args = ["SUPERSELF"]

        protocol_generic_args = [
            self._typevar_inner_replacements[tvar].__name__ for tvar in typevar_overlap
        ] + extra_declaration_args
        if protocol_generic_args:
            original_type_var_names = []
            for tvar in typevar_overlap:
                original_type_var_names.append(self._formatannotation(tvar))

            instance_argstr = ", ".join(original_type_var_names + extra_instance_args)
            parent_type_var_names_spec = f"[{instance_argstr}]"
            declaration_argstr = ", ".join(protocol_generic_args)
            protocol_declaration_type_var_spec = f"[{declaration_argstr}]"

            # recursively replace any used type vars in the function annotation with newly created
            transform_signature = replace_type_vars(self._typevar_inner_replacements)
        else:
            transform_signature = lambda x: x  # noqa
            parent_type_var_names_spec = ""
            protocol_declaration_type_var_spec = ""

        return transform_signature, parent_type_var_names_spec, protocol_declaration_type_var_spec

    def add_type_var(self, type_var: typing.Union[typing.TypeVar, typing_extensions.ParamSpec], name: str):
        if name in self.global_types:
            # skip already added type
            # TODO: check that the already added type is the same?
            return

        if isinstance(type_var, typing_extensions.ParamSpec):
            type_module = "typing_extensions"  # this ensures stubs created by newer Python's still work on Python 3.9
            type_name = "ParamSpec"
        elif isinstance(type_var, typing.TypeVar):
            type_module = "typing"
            type_name = "TypeVar"
        else:
            raise TypeError("Not a TypeVar/ParamSpec")

        self.imports.add(type_module)
        args = [f'"{name}"']
        if type_var.__bound__ and type_var.__bound__ is not type(None):
            translated_bound = self._translate_global_annotation(type_var.__bound__, type_var)
            str_annotation = self._formatannotation(translated_bound)
            args.append(f'bound="{str_annotation}"')
        if isinstance(type_var, typing.TypeVar) and type_var.__covariant__:
            args.append("covariant=True")

        self.global_types.add(name)
        self.parts.append(f"{name} = {type_module}.{type_name}({', '.join(args)})")

    def get_source(self):
        missing_types = self.referenced_global_types - self.global_types
        if missing_types:
            print(f"WARNING: {self.target_module} missing the following referenced types, expected to be in module")
            for t in missing_types:
                print(t)
        import_src = "\n".join(sorted(f"import {mod}" for mod in self.imports))
        stubs = "\n\n".join(self.parts)
        return f"{import_src}\n\n{stubs}".lstrip()

    def _get_docstring(self, obj: object, indentation: str) -> str:
        docstring = inspect.getdoc(obj) or ""
        if docstring:
            end = "\n" if "\n" in docstring else ""  # Place end-quotes appropriately
            if '"""' in docstring:
                if "'''" in docstring:
                    warnings.warn(
                        f"Docstring for {obj} contains both \"\"\" and ''' quote blocks; suppressing from type stubs."
                    )
                    return ""
                quotes = "'''"
            else:
                quotes = '"""'
            docstring = textwrap.indent(f"{quotes}{docstring}{end}{quotes}", indentation)
        return docstring

    def _ensure_import(self, typ):
        # add import for a single type, non-recursive (See _register_imports)
        # also marks the type name as directly referenced if it's part of the target module
        # so we can sanity check
        module = safe_get_module(typ)

        if module not in (self.target_module, "builtins"):
            self.imports.add(module)

        if module == self.target_module:
            if not hasattr(typ, "__name__"):
                # weird special case with Generic subclasses in the target module
                # fall back to the origin name
                generic_origin = typ.__origin__
                name = generic_origin.__name__
            else:
                name = typ.__name__
            self.referenced_global_types.add(name)

    def _register_imports(self, type_annotation):
        # recursively makes sure a type and any of its type arguments (for generics) are imported
        origin = get_origin(type_annotation)
        args = getattr(type_annotation, "__args__", ())

        if origin is None:
            # "scalar" base type (not a generic, not a PEP 604 union)
            if hasattr(type_annotation, "__module__"):
                self._ensure_import(type_annotation)
            return

        self._ensure_import(type_annotation)  # import the generic itself's module
        for arg in args:
            self._register_imports(arg)

    def _translate_global_annotation(self, annotation, source_class_or_function):
        # convenience wrapper for _translate_annotation when the translated entity itself
        # determines eval scope and synchronizer target

        # infers synchronizer, target and home_module from an entity (class, function) containing the annotation
        synchronicity_target_interface = getattr(source_class_or_function, TARGET_INTERFACE_ATTR, None)
        synchronizer = getattr(source_class_or_function, SYNCHRONIZER_ATTR, None)
        if synchronizer:
            home_module = safe_get_module(getattr(source_class_or_function, synchronizer._original_attr))
        else:
            home_module = safe_get_module(source_class_or_function)

        return self._translate_annotation(annotation, synchronizer, synchronicity_target_interface, home_module)

    def _translate_annotation(
        self,
        annotation,
        synchronizer: typing.Optional[synchronicity.Synchronizer],
        synchronicity_target_interface: typing.Optional[Interface],
        home_module: typing.Optional[str],
    ):
        """
        Takes an annotation (type, generic, typevar, forward ref) and applies recursively (in case of generics):
        * eval for string annotations (importing `home_module` to be used as namespace)
        * re-mapping of the annotation to the correct synchronicity target
          (using synchronizer and synchronicity_target_interface)
        * registers imports for all referenced modules
        """
        if isinstance(annotation, typing.ForwardRef):  # TypeVars wrap their arguments as ForwardRefs (sometimes?)
            annotation = annotation.__forward_arg__
        if isinstance(annotation, str):
            try:
                annotation = evaluated_annotation(annotation, declaration_module=home_module)
            except Exception:
                logger.exception(
                    f"Error when evaluating {annotation} in {home_module}. Falling back to string annotation"
                )
                return annotation
        if type(annotation) is list:  # not using isinstance since ParamSpec is a subclass of list in Python 3.9
            return [
                self._translate_annotation(x, synchronizer, synchronicity_target_interface, home_module)
                for x in annotation
            ]

        translated_annotation = self._translate_annotation_map_types(
            annotation,
            synchronizer=synchronizer,
            interface=synchronicity_target_interface,
            home_module=home_module,
        )
        self._register_imports(translated_annotation)
        return translated_annotation

    def _translate_annotation_map_types(
        self,
        type_annotation,
        synchronizer: typing.Optional[synchronicity.Synchronizer],
        interface: typing.Optional[Interface],
        home_module: typing.Optional[str] = None,
    ):
        # recursively map a nested type annotation to match the output interface
        origin = get_origin(type_annotation)
        args = safe_get_args(type_annotation)

        if isinstance(type_annotation, (typing_extensions.ParamSpecArgs, typing_extensions.ParamSpecKwargs)):
            # ParamSpecArgs and ParamSpecKwargs are special - they have an origin (the ParamSpec) but no attrs
            # we need to translate the origin in case it's a translated type annotation
            translated_origin = type_annotation.__origin__
            if synchronizer:
                translated_origin = synchronizer._translate_out(translated_origin, interface)
            return type(type_annotation)(translated_origin)

        elif origin is None or args is None:
            # TODO(elias): handle translation of un-parameterized async entities, like `Awaitable`
            # scalar - if type is synchronicity origin type, use the blocking/async version instead
            if synchronizer:
                return synchronizer._translate_out(type_annotation, interface)
            return type_annotation

        # Generics
        if origin == typing.Literal:
            mapped_args = args
        else:
            mapped_args = tuple(self._translate_annotation(arg, synchronizer, interface, home_module) for arg in args)

        if interface == Interface.BLOCKING:
            # blocking interface special generic translations:
            if origin == collections.abc.AsyncGenerator:
                return typing.Generator[mapped_args + (None,)]  # type: ignore[valid-type,misc]

            if origin == contextlib.AbstractAsyncContextManager:
                # TODO: in Python 3.13 mapped_args has a second argument for the exit type of the context
                #  manager, but we ignore that for now
                return combined_types.AsyncAndBlockingContextManager[mapped_args[0]]  # type: ignore[valid-type]

            if origin == collections.abc.AsyncIterable:
                return typing.Iterable[mapped_args]  # type: ignore[valid-type]

            if origin == collections.abc.AsyncIterator:
                return typing.Iterator[mapped_args]  # type: ignore[valid-type]

            if origin == collections.abc.Awaitable:
                return mapped_args[0]

            if origin == collections.abc.Coroutine:
                return mapped_args[2]

        # first see if the generic itself needs translation (in case of wrapped custom generics)
        if safe_get_module(origin) not in (
            "typing",
            "collections.abc",
            "contextlib",
            "builtins",
        ):  # don't translate built in generics in type annotations, even if they have been synchronicity wrapped
            # for base-class compatibility (e.g. AsyncContextManager, typing.Generic), otherwise it will break typing
            translated_origin = self._translate_annotation(origin, synchronizer, interface, home_module)
            t = translated_origin[mapped_args]  # type: ignore  # this seems to fall back to the __class_getitem__ of the implementation class
            # In order to get the right origin and args on the output, we manuall have to assign them:
            # TODO: We could probably fix this in the synchronicity layer by making wrapped generics true generics, or
            #  hackily by not letting __class_getitem__ proxy to the wrapped class' method for custom generics
            t.__module__ = safe_get_module(translated_origin)
            t.__origin__ = translated_origin
            t.__args__ = mapped_args
            return t

        return generic_copy_with_args(type_annotation, mapped_args)

    def _custom_signature(self, func, transform_signature=None) -> str:
        """
        We use this instead o str(inspect.Signature()) due to a few issues:
        * Generics with None args are incorrectly encoded as NoneType in str(signature)
        * Some names for stdlib module object types omit the module qualification (notably typing)
        * We might have to stringify annotations to support forward/self references
        * General flexibility like not being able to maintain *comments* in the arg declarations if we want to
        * We intentionally do not use follow_wrapped,
          since it will override runtime-transformed annotations on a wrapper
        * TypeVars default repr is `~T` instead of `origin_module.T` etc.
        """

        interface = getattr(func, TARGET_INTERFACE_ATTR, None)
        synchronizer = getattr(func, SYNCHRONIZER_ATTR, None)

        if synchronizer:
            home_module = safe_get_module(getattr(func, synchronizer._original_attr))
        else:
            home_module = safe_get_module(func)

        root_func = func
        if interface and synchronizer:
            root_func = synchronizer._translate_in(func)

        # TODO: sigtools.specifiers.signature does not support Python 3.14 annotations
        sig = sigtools.specifiers.signature(root_func)

        if sig.upgraded_return_annotation is not EmptyAnnotation:
            raw_return_annotation = sig.upgraded_return_annotation.source_value()
            return_annotation = self._translate_annotation(raw_return_annotation, synchronizer, interface, home_module)
            sig = sig.replace(
                return_annotation=return_annotation,
                upgraded_return_annotation=UpgradedAnnotation.upgrade(
                    return_annotation, func, None
                ),  # not sure if needed
            )

        new_parameters = []
        for param in sig.parameters.values():
            if param.upgraded_annotation is not EmptyAnnotation:
                raw_annotation = param.upgraded_annotation.source_value()
                translated_annotation = self._translate_annotation(raw_annotation, synchronizer, interface, home_module)
            elif param.annotation != inspect._empty:
                raw_annotation = param.annotation
                translated_annotation = self._translate_annotation(raw_annotation, synchronizer, interface, home_module)
            else:
                translated_annotation = param.annotation

            new_parameters.append(
                param.replace(
                    annotation=translated_annotation,
                    upgraded_annotation=UpgradedAnnotation.upgrade(
                        translated_annotation, func, param.name
                    ),  # not sure if needed...
                )
            )

        sig = sig.replace(parameters=new_parameters)

        if transform_signature:
            sig = transform_signature(sig)
        # kind of ugly, but this ensures valid formatting of Generics etc, see docstring above and _formatannotation
        with mock.patch("inspect.formatannotation", self._formatannotation):
            return str(sig)

    def _get_var_annotation(self, name, annotation):
        # TODO: how to translate annotation here - we don't know the home module
        self._register_imports(annotation)
        return f"{name}: {self._formatannotation(annotation, None)}"

    def _formatannotation(self, annotation, base_module=None, quote_annotation_strings: bool = True) -> str:
        """modified version of `inspect.formatannotations`
        * Uses verbatim `None` instead of `NoneType` for None-arguments in generic types
        * Doesn't omit `typing.`-module from qualified imports in type names
        * ignores base_module (uses self.target_module instead)
        * ignores quote_annotation_strings
        """
        origin = get_origin(annotation)

        # For forward refs from modules that cannot be evaluated at runtime
        # but can be used freely in stub files, import the module and return the
        # original annotation
        if isinstance(annotation, typing.ForwardRef):
            if hasattr(annotation, "__forward_module__") and annotation.__forward_module__ in TYPE_CHECKING_OVERRIDES:
                self.imports.add(annotation.__forward_module__)
                return annotation.__forward_arg__

        # The remaining forward refs should already have been evaluated
        assert not isinstance(annotation, typing.ForwardRef)
        args = safe_get_args(annotation)

        if isinstance(annotation, typing_extensions.ParamSpecArgs):
            return self._formatannotation(typing_extensions.get_origin(annotation)) + "." + "args"

        if isinstance(annotation, typing_extensions.ParamSpecKwargs):
            return self._formatannotation(typing_extensions.get_origin(annotation)) + "." + "kwargs"

        if origin is None or not args:
            if annotation == typing.Sized:
                return "typing.Sized"  # fix Python 3.8(+?) where the repr is "typing.Sized[]" for some reason
            if annotation == typing.Hashable:
                return "typing.Hashable"  # fix Python 3.8(+?) where the repr is "typing.Hashable[]" for some reason

            if annotation == Ellipsis:
                return "..."
            if isinstance(annotation, type) or isinstance(annotation, (TypeVar, typing_extensions.ParamSpec)):
                if annotation is type(None):  # check for "NoneType"
                    return "None"
                name = (
                    annotation.__qualname__  # type: ignore
                    if hasattr(annotation, "__qualname__")
                    else annotation.__name__
                )
                annotation_module = safe_get_module(annotation)
                if annotation_module in ("builtins", self.target_module):
                    return name
                if annotation_module is None:
                    raise Exception(
                        f"{annotation} has __module__ == None - did you forget"
                        " to specify target module on a blocking type?"
                    )
                return annotation_module + "." + name
            if isinstance(annotation, list):
                # e.g. first argument to typing.Callable
                subargs = ",".join([self._formatannotation(arg) for arg in annotation])
                return f"[{subargs}]"

            return repr(annotation)

        # generic:
        origin_name = get_specific_generic_name(annotation)
        if origin is contextlib.AbstractAsyncContextManager:
            # python 3.13 adds a second optional exit arg, we only want to emit the first one
            # to be backwards compatible
            args = args[:1]

        if (safe_get_module(annotation), origin_name) == ("typing", "Optional"):
            # typing.Optional adds a None argument that we shouldn't include when formatting
            (optional_arg,) = [a for a in args if a is not type(None)]
            comma_separated_args = self._formatannotation(optional_arg)
        else:
            formatted_args = [self._formatannotation(a) for a in args]
            comma_separated_args = ", ".join(formatted_args)

        annotation_module = safe_get_module(annotation)
        if annotation_module in ("typing", "contextlib") and origin_name.startswith("Abstract"):
            # This is needed for Python <=3.8 where there is a bug (?) in the typing.AsyncContextManager
            # causing it to be represented with the non-existent name typing.AbstractContextManager
            # >>> typing.AsyncContextManager
            # typing.AbstractAsyncContextManager
            origin_name = origin_name[len("Abstract") :]  # cut the "Abstract"

        if annotation_module not in ("builtins", self.target_module):
            # need to qualify the module of the origin
            origin_module = annotation_module
            origin_name = f"{origin_module}.{origin_name}"

        return f"{origin_name}[{comma_separated_args}]"

    def _indent(self, level):
        return level * self._indentation

    def _get_function_source_with_overloads(self, func, name, indentation_level=0, transform_signature=None) -> str:
        signature_indent = self._indent(indentation_level)
        body_indent = self._indent(indentation_level + 1)
        parts = []

        interface = func.__dict__.get(TARGET_INTERFACE_ATTR)

        synchronizer = func.__dict__.get(SYNCHRONIZER_ATTR)
        if interface:
            root_func = func.__dict__[SYNCHRONIZER_ATTR]._translate_in(func)
        else:
            root_func = func

        overloaded_signatures = overload_tracking.get_overloads(root_func)
        for overload_func in overloaded_signatures:
            self.imports.add("typing")
            parts.append(f"{signature_indent}@typing.overload")

            if interface:
                overload_func = synchronizer._wrap(overload_func, interface, name=name)

            overload_src = self._get_function_source(
                overload_func,
                name,
                signature_indent,
                body_indent,
                transform_signature=transform_signature,
                add_docstring=False,
            )
            parts.append(overload_src)

        if not overloaded_signatures:
            # only add the functions complete signatures if there are no stubs
            parts.append(
                self._get_function_source(
                    func,
                    name,
                    signature_indent,
                    body_indent,
                    transform_signature=transform_signature,
                )
            )
        return "\n".join(parts)

    def _get_function_source(
        self,
        func,
        name,
        signature_indent: str,
        body_indent: str,
        transform_signature=None,
        add_docstring=True,
    ) -> str:
        maybe_decorators = ""
        if hasattr(func, "__dataclass_transform__"):
            dt_spec = func.__dataclass_transform__
            if dt_spec["field_specifiers"]:
                refs = ""
                for field_spec_entity in dt_spec["field_specifiers"]:
                    field_spec_module = safe_get_module(field_spec_entity)
                    if field_spec_module == self.target_module:
                        ref = field_spec_entity.__qualname__
                    else:
                        self.imports.add(field_spec_module)
                        ref = f"{field_spec_module}.{field_spec_entity.__qualname__}"
                    refs += ref + ", "

                args = f"field_specifiers=({refs}), "
            bool_attrs = {"eq_default": True, "order_default": False, "kw_only_default": False, "frozen_default": False}
            for k, v in bool_attrs.items():
                if dt_spec[k] != v:
                    args += f"{k}={dt_spec[k]}, "

            self.imports.add("typing_extensions")
            maybe_decorators = f"{signature_indent}@typing_extensions.dataclass_transform({args})\n"

        async_prefix = ""
        if is_coroutine_function_follow_wrapped(func):
            # note: async prefix should not be used for annotated abstract/stub *async generators*,
            # so we don't check for inspect.isasyncgenfunction since they contain no yield keyword,
            # and would otherwise indicate an awaitable that returns an async generator to static type checkers
            async_prefix = "async "

        signature = self._custom_signature(func, transform_signature)
        maybe_docstring = self._get_docstring(func, body_indent) if add_docstring else ""

        return "\n".join(
            [
                f"{maybe_decorators}{signature_indent}{async_prefix}def {name}{signature}:",
                *([maybe_docstring] if maybe_docstring else []),
                f"{body_indent}...",
                "",
            ]
        )


def write_stub(module_path: str):
    with overload_tracking.patched_overload():
        mod = importlib.import_module(module_path)
        assert mod.__file__ is not None
        emitter = StubEmitter.from_module(mod)
        source = emitter.get_source()
        stub_path = Path(mod.__file__).with_suffix(".pyi")
        stub_path.write_text(source)
        return stub_path


if __name__ == "__main__":
    for module_path in sys.argv[1:]:
        out_path = write_stub(module_path)
        print(f"Wrote {out_path}")
