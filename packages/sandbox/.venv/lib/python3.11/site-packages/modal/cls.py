# Copyright Modal Labs 2022
import dataclasses
import inspect
import typing
from collections.abc import Collection
from pathlib import PurePosixPath
from typing import Any, Callable, Optional, Sequence, TypeVar, Union

from google.protobuf.message import Message

from modal_proto import api_pb2

from ._functions import _Function, _parse_retries
from ._load_context import LoadContext
from ._object import _Object, live_method
from ._partial_function import (
    _find_callables_for_obj,
    _find_partial_methods_for_user_cls,
    _PartialFunction,
    _PartialFunctionFlags,
)
from ._resolver import Resolver
from ._resources import convert_fn_config_to_resources_config
from ._serialization import check_valid_cls_constructor_arg
from ._traceback import print_server_warnings
from ._type_manager import parameter_serde_registry
from ._utils.async_utils import synchronize_api, synchronizer
from ._utils.deprecation import (
    deprecation_warning,
    warn_if_passing_namespace,
    warn_on_renamed_autoscaler_settings,
)
from ._utils.mount_utils import validate_volumes
from .client import _Client
from .cloud_bucket_mount import _CloudBucketMount
from .exception import ExecutionError, InvalidError, NotFoundError
from .gpu import GPU_T
from .retries import Retries
from .secret import _Secret
from .volume import _Volume

T = TypeVar("T")


if typing.TYPE_CHECKING:
    import modal.app


def _use_annotation_parameters(user_cls: type) -> bool:
    has_parameters = any(is_parameter(cls_member) for cls_member in user_cls.__dict__.values())
    has_explicit_constructor = user_cls.__init__ != object.__init__
    return has_parameters and not has_explicit_constructor


def _get_class_constructor_signature(user_cls: type) -> inspect.Signature:
    if not _use_annotation_parameters(user_cls):
        return inspect.signature(user_cls)
    else:
        constructor_parameters = []
        for name, annotation_value in typing.get_type_hints(user_cls).items():
            if hasattr(user_cls, name):
                parameter_spec = getattr(user_cls, name)
                if is_parameter(parameter_spec):
                    maybe_default = {}
                    if not isinstance(parameter_spec.default, _NO_DEFAULT):
                        maybe_default["default"] = parameter_spec.default

                    param = inspect.Parameter(
                        name=name,
                        annotation=annotation_value,
                        kind=inspect.Parameter.POSITIONAL_OR_KEYWORD,
                        **maybe_default,
                    )
                    constructor_parameters.append(param)

        return inspect.Signature(constructor_parameters)


@dataclasses.dataclass()
class _ServiceOptions:
    # Note that default values should always be "untruthy" so we can detect when they are not set
    secrets: Collection[_Secret] = ()
    validated_volumes: typing.Sequence[tuple[str, _Volume]] = ()
    resources: Optional[api_pb2.Resources] = None
    retry_policy: Optional[api_pb2.FunctionRetryPolicy] = None
    max_containers: Optional[int] = None
    buffer_containers: Optional[int] = None
    scaledown_window: Optional[int] = None
    timeout_secs: Optional[int] = None
    max_concurrent_inputs: Optional[int] = None
    target_concurrent_inputs: Optional[int] = None
    batch_max_size: Optional[int] = None
    batch_wait_ms: Optional[int] = None
    scheduler_placement: Optional[api_pb2.SchedulerPlacement] = None
    cloud: Optional[str] = None
    cloud_bucket_mounts: typing.Sequence[tuple[str, _CloudBucketMount]] = ()

    def merge_options(self, new_options: "_ServiceOptions") -> "_ServiceOptions":
        """Implement protobuf-like MergeFrom semantics for this dataclass.

        This mostly exists to support "stacking" of `.with_options()` calls.
        Returns a new _ServiceOptions instance without modifying self.
        """
        # Create a shallow copy of self to start with
        merged = dataclasses.replace(self)

        # Don't use dataclasses.asdict() because it does a deepcopy(), which chokes on a hydrated object
        new_options_dict = {k.name: getattr(new_options, k.name) for k in dataclasses.fields(new_options)}

        # Resources needs special merge handling because individual fields are parameters in the public API
        merged_resources = api_pb2.Resources()
        if merged.resources:
            merged_resources.MergeFrom(merged.resources)
        if new_resources := new_options_dict.pop("resources"):
            merged_resources.MergeFrom(new_resources)
        merged.resources = merged_resources

        for key, value in new_options_dict.items():
            if value:  # Only overwrite data when the value was set in the new options
                setattr(merged, key, value)

        return merged


def _bind_instance_method(cls: "_Cls", service_function: _Function, method_name: str):
    """Binds an "instance service function" to a specific method using metadata for that method

    This "dummy" _Function gets no unique object_id and isn't backend-backed at all, since all
    it does it forward invocations to the underlying instance_service_function with the specified method
    """
    assert service_function._obj

    def hydrate_from_instance_service_function(new_function: _Function):
        assert service_function.is_hydrated
        assert cls.is_hydrated
        # After 0.67 is minimum required version, we should be able to use method metadata directly
        # from the service_function instead (see _Cls._hydrate_metadata), but for now we use the Cls
        # since it can take the data from the cls metadata OR function metadata depending on source
        method_metadata = cls._method_metadata[method_name]
        new_function._hydrate(service_function.object_id, service_function.client, method_metadata)

    async def _load(fun: "_Function", resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]):
        # there is currently no actual loading logic executed to create each method on
        # the *parametrized* instance of a class - it uses the parameter-bound service-function
        # for the instance. This load method just makes sure to set all attributes after the
        # `service_function` has been loaded (it's in the `_deps`)
        hydrate_from_instance_service_function(fun)

    def _deps():
        unhydrated_deps = []
        # without this check, the common service_function will be reloaded by all methods
        # TODO(elias): Investigate if we can fix this multi-loader in the resolver - feels like a bug?
        if not cls.is_hydrated:
            unhydrated_deps.append(cls)
        if not service_function.is_hydrated:
            unhydrated_deps.append(service_function)
        return unhydrated_deps

    rep = f"Method({cls._name}.{method_name})"

    # Bound methods should *reference* their parent Cls's LoadContext
    # so that it can be modified in place on the parent and be reflected in the method
    fun = _Function._from_loader(
        _load,
        rep,
        deps=_deps,
        hydrate_lazily=True,
        load_context_overrides=cls._load_context_overrides,
    )
    if service_function.is_hydrated:
        # Eager hydration (skip load) if the instance service function is already loaded
        hydrate_from_instance_service_function(fun)

    if cls._is_local():
        partial_function = cls._method_partials[method_name]
        from modal._utils.function_utils import FunctionInfo

        fun._info = FunctionInfo(
            # ugly - needed for .local()  TODO (elias): Clean up!
            partial_function.raw_f,
            user_cls=cls._user_cls,
            serialized=True,  # service_function.info.is_serialized(),
        )

    fun._obj = service_function._obj
    fun._is_method = True
    fun._app = service_function._app
    fun._spec = service_function._spec
    return fun


class _Obj:
    """An instance of a `Cls`, i.e. `Cls("foo", 42)` returns an `Obj`.

    All this class does is to return `Function` objects."""

    _cls: "_Cls"  # parent
    _functions: dict[str, _Function]
    _has_entered: bool
    _user_cls_instance: Optional[Any] = None
    _args: tuple[Any, ...]
    _kwargs: dict[str, Any]

    _instance_service_function: Optional[_Function] = None  # this gets set lazily
    _options: Optional[_ServiceOptions]

    def __init__(
        self,
        cls: "_Cls",
        user_cls: Optional[type],  # this would be None in case of lookups
        options: Optional[_ServiceOptions],
        args,
        kwargs,
    ):
        for i, arg in enumerate(args):
            check_valid_cls_constructor_arg(i + 1, arg)
        for key, kwarg in kwargs.items():
            check_valid_cls_constructor_arg(key, kwarg)
        self._cls = cls

        # Used for construction local object lazily
        self._has_entered = False
        self._user_cls = user_cls

        # used for lazy construction in case of explicit constructors
        self._args = args
        self._kwargs = kwargs
        self._options = options

    def _cached_service_function(self) -> "modal.functions._Function":
        # Returns a service function for this _Obj, serving all its methods
        # In case of methods without parameters or options, this is simply proxying to the class service function
        if not self._instance_service_function:
            assert self._cls._class_service_function
            self._instance_service_function = self._cls._class_service_function._bind_parameters(
                self, self._options, self._args, self._kwargs
            )
        return self._instance_service_function

    def _get_parameter_values(self) -> dict[str, Any]:
        # binds args and kwargs according to the class constructor signature
        # (implicit by parameters or explicit)
        # can only be called where the local definition exists
        sig = _get_class_constructor_signature(self._user_cls)
        bound_vars = sig.bind(*self._args, **self._kwargs)
        bound_vars.apply_defaults()
        return bound_vars.arguments

    def _new_user_cls_instance(self):
        if not _use_annotation_parameters(self._user_cls):
            # TODO(elias): deprecate this code path eventually
            user_cls_instance = self._user_cls(*self._args, **self._kwargs)
        else:
            # ignore constructor (assumes there is no custom constructor,
            # which is guaranteed by _use_annotation_parameters)
            # set the attributes on the class corresponding to annotations
            # with = parameter() specifications
            param_values = self._get_parameter_values()
            user_cls_instance = self._user_cls.__new__(self._user_cls)  # new instance without running __init__
            user_cls_instance.__dict__.update(param_values)

        # TODO: always use Obj instances instead of making modifications to user cls
        # TODO: OR (if simpler for now) replace all the PartialFunctions on the user cls
        #   with getattr(self, method_name)

        # user cls instances are only created locally, so we have all partial functions available
        instance_methods = {}
        for method_name in _find_partial_methods_for_user_cls(self._user_cls, _PartialFunctionFlags.interface_flags()):
            instance_methods[method_name] = getattr(self, method_name)

        user_cls_instance._modal_functions = instance_methods
        return user_cls_instance

    async def update_autoscaler(
        self,
        *,
        min_containers: Optional[int] = None,
        max_containers: Optional[int] = None,
        scaledown_window: Optional[int] = None,
        buffer_containers: Optional[int] = None,
    ) -> None:
        """Override the current autoscaler behavior for this Cls instance.

        Unspecified parameters will retain their current value, i.e. either the static value
        from the function decorator, or an override value from a previous call to this method.

        Subsequent deployments of the App containing this Cls will reset the autoscaler back to
        its static configuration.

        Note: When calling this method on a Cls that is defined locally, static type checkers will
        issue an error, because the object will appear to have the user-defined type.

        Examples:

        ```python notest
        Model = modal.Cls.from_name("my-app", "Model")
        model = Model()  # This method is called on an *instance* of the class

        # Always have at least 2 containers running, with an extra buffer when the Function is active
        model.update_autoscaler(min_containers=2, buffer_containers=1)

        # Limit this Function to avoid spinning up more than 5 containers
        f.update_autoscaler(max_containers=5)
        ```

        """
        return await self._cached_service_function().update_autoscaler(
            min_containers=min_containers,
            max_containers=max_containers,
            scaledown_window=scaledown_window,
            buffer_containers=buffer_containers,
        )

    async def keep_warm(self, warm_pool_size: int) -> None:
        """mdmd:hidden
        Set the warm pool size for the class containers

        DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

        ```python notest
        Model = modal.Cls.from_name("my-app", "Model")
        model = Model()  # This method is called on an *instance* of the class

        # Old pattern (deprecated)
        model.keep_warm(2)

        # New pattern
        model.update_autoscaler(min_containers=2)
        ```

        """
        deprecation_warning(
            (2025, 5, 5),
            "The .keep_warm() method has been deprecated in favor of the more general "
            ".update_autoscaler(min_containers=...) method.",
            show_source=True,
        )
        await self._cached_service_function().update_autoscaler(min_containers=warm_pool_size)

    def _cached_user_cls_instance(self):
        """Get or construct the local object

        Used for .local() calls and getting attributes of classes"""
        if not self._user_cls_instance:
            self._user_cls_instance = self._new_user_cls_instance()  # Instantiate object

        return self._user_cls_instance

    def _enter(self):
        assert self._user_cls
        if not self._has_entered:
            user_cls_instance = self._cached_user_cls_instance()
            if hasattr(user_cls_instance, "__enter__"):
                user_cls_instance.__enter__()

            for method_flag in (
                _PartialFunctionFlags.ENTER_PRE_SNAPSHOT,
                _PartialFunctionFlags.ENTER_POST_SNAPSHOT,
            ):
                for enter_method in _find_callables_for_obj(user_cls_instance, method_flag).values():
                    enter_method()

            self._has_entered = True

    @property
    def _entered(self) -> bool:
        # needed because _aenter is nowrap
        return self._has_entered

    @_entered.setter
    def _entered(self, val: bool):
        self._has_entered = val

    @synchronizer.nowrap
    async def _aenter(self):
        if not self._entered:  # use the property to get at the impl class
            user_cls_instance = self._cached_user_cls_instance()
            if hasattr(user_cls_instance, "__aenter__"):
                await user_cls_instance.__aenter__()
            elif hasattr(user_cls_instance, "__enter__"):
                user_cls_instance.__enter__()
        self._has_entered = True

    def __getattr__(self, k):
        # This is a bit messy and branchy because:
        # * Support .remote() on both hydrated (local or remote classes) or unhydrated classes (remote classes only)
        # * Support .local() on both hydrated and unhydrated classes (assuming local access to code)
        # * Support attribute access (when local cls is available)

        # The returned _Function objects need to be lazily loaded (including loading the Cls and/or service function)
        # since we can't assume the class is already loaded when this gets called, e.g.
        # CLs.from_name(...)().my_func.remote().

        def _get_maybe_method() -> Optional["_Function"]:
            """Gets _Function object for method - either for a local or a hydrated remote class

            * If class is neither local or hydrated - raise exception (should never happen)
            * If attribute isn't a method - return None
            """
            if self._cls._is_local():
                if k not in self._cls._method_partials:
                    return None
            elif self._cls.is_hydrated:
                if k not in self._cls._method_metadata:
                    return None
            else:
                raise ExecutionError(
                    "Class is neither hydrated or local - this is probably a bug in the Modal client. Contact support"
                )

            return _bind_instance_method(self._cls, self._cached_service_function(), k)

        if self._cls.is_hydrated or self._cls._is_local():
            # Class is hydrated or local so we know which methods exist
            if maybe_method := _get_maybe_method():
                return maybe_method
            elif self._cls._is_local():
                # We have the local definition, and the attribute isn't a method
                # so we instantiate if we don't have an instance, and try to get the attribute
                user_cls_instance = self._cached_user_cls_instance()
                return getattr(user_cls_instance, k)
            else:
                # This is the case for a *hydrated* class without the local definition, i.e. a lookup
                # where the attribute isn't a registered method of the class
                raise NotFoundError(
                    f"Class has no method `{k}` and attributes (or undecorated methods) can't be accessed for"
                    f" remote classes (`Cls.from_name` instances)"
                )

        # Not hydrated Cls, and we don't have the class - typically a Cls.from_name that
        # has not yet been loaded. So use a special loader that loads it lazily:
        async def method_loader(fun, resolver: Resolver, load_context: LoadContext, existing_object_id):
            method_function = _get_maybe_method()
            if method_function is None:
                raise NotFoundError(
                    f"Class has no method {k}, and attributes can't be accessed for `Cls.from_name` instances"
                )
            await resolver.load(method_function, load_context)  # get the appropriate method handle (lazy)
            fun._hydrate_from_other(method_function)

        # The reason we don't *always* use this lazy loader is because it precludes attribute access
        # on local classes.
        return _Function._from_loader(
            method_loader,
            rep=f"Method({self._cls._name}.{k})",
            deps=lambda: [self._cls],
            hydrate_lazily=True,
            load_context_overrides=self._cls._load_context_overrides,
        )


Obj = synchronize_api(_Obj)


class _Cls(_Object, type_prefix="cs"):
    """
    Cls adds method pooling and [lifecycle hook](https://modal.com/docs/guide/lifecycle-functions) behavior
    to [modal.Function](https://modal.com/docs/reference/modal.Function).

    Generally, you will not construct a Cls directly.
    Instead, use the [`@app.cls()`](https://modal.com/docs/reference/modal.App#cls) decorator on the App object.
    """

    _class_service_function: Optional[_Function]  # The _Function (read "service") serving *all* methods of the class
    _options: _ServiceOptions

    _app: Optional["modal.app._App"] = None  # not set for lookups
    _name: Optional[str]
    # Only set for hydrated classes:
    _method_metadata: Optional[dict[str, api_pb2.FunctionHandleMetadata]] = None

    # These are only set where source is locally available:
    # TODO: wrap these in a single optional/property for consistency
    _user_cls: Optional[type] = None
    _method_partials: Optional[dict[str, _PartialFunction]] = None
    _callables: dict[str, Callable[..., Any]]

    def _initialize_from_empty(self):
        self._user_cls = None
        self._class_service_function = None
        self._options = _ServiceOptions()
        self._callables = {}
        self._name = None

    def _initialize_from_other(self, other: "_Cls"):
        super()._initialize_from_other(other)
        self._app = other._app
        self._user_cls = other._user_cls
        self._class_service_function = other._class_service_function
        self._method_partials = other._method_partials
        self._options = other._options
        self._callables = other._callables
        self._name = other._name
        self._method_metadata = other._method_metadata
        self._load_context_overrides = other._load_context_overrides

    def _get_partial_functions(self) -> dict[str, _PartialFunction]:
        if not self._user_cls:
            raise AttributeError("You can only get the partial functions of a local Cls instance")
        return _find_partial_methods_for_user_cls(self._user_cls, _PartialFunctionFlags.all())

    def _get_app(self) -> "modal.app._App":
        assert self._app is not None
        return self._app

    def _get_user_cls(self) -> type:
        assert self._user_cls is not None
        return self._user_cls

    def _get_name(self) -> str:
        assert self._name is not None
        return self._name

    def _get_class_service_function(self) -> _Function:
        assert self._class_service_function is not None
        return self._class_service_function

    def _get_method_names(self) -> Collection[str]:
        # returns method names for a *local* class only for now (used by cli)
        return self._method_partials.keys()

    @live_method
    async def _experimental_get_flash_urls(self) -> Optional[list[str]]:
        """URL of the flash service for the class."""
        return await self._get_class_service_function()._experimental_get_flash_urls()

    def _hydrate_metadata(self, metadata: Message):
        assert isinstance(metadata, api_pb2.ClassHandleMetadata)
        class_service_function = self._get_class_service_function()
        assert class_service_function.is_hydrated

        if class_service_function._method_handle_metadata and len(class_service_function._method_handle_metadata):
            # If we have the metadata on the class service function
            # This should be the case for any loaded class (remote or local) as of v0.67
            method_metadata = class_service_function._method_handle_metadata
        else:
            # Method metadata stored on the backend Cls object - pre 0.67 lookups
            # Can be removed when v0.67 is least supported version (all metadata is on the function)
            method_metadata = {}
            for method in metadata.methods:
                method_metadata[method.function_name] = method.function_handle_metadata
        self._method_metadata = method_metadata

    @staticmethod
    def validate_construction_mechanism(user_cls):
        """mdmd:hidden"""
        params = {k: v for k, v in user_cls.__dict__.items() if is_parameter(v)}
        has_custom_constructor = user_cls.__init__ != object.__init__
        if params and has_custom_constructor:
            raise InvalidError(
                "A class can't have both a custom __init__ constructor "
                "and dataclass-style modal.parameter() annotations"
            )
        elif has_custom_constructor:
            deprecation_warning(
                (2025, 4, 15),
                f"""
{user_cls} uses a non-default constructor (__init__) method.
Custom constructors will not be supported in a a future version of Modal.

To parameterize classes, use dataclass-style modal.parameter() declarations instead,
e.g.:\n

class {user_cls.__name__}:
    model_name: str = modal.parameter()

More information on class parameterization can be found here: https://modal.com/docs/guide/parametrized-functions
""",
            )
        annotations = inspect.get_annotations(user_cls)
        missing_annotations = params.keys() - annotations.keys()
        if missing_annotations:
            raise InvalidError("All modal.parameter() specifications need to be type-annotated")

        annotated_params = {k: t for k, t in annotations.items() if k in params}
        for k, t in annotated_params.items():
            try:
                parameter_serde_registry.validate_parameter_type(t)
            except TypeError as exc:
                raise InvalidError(f"Class parameter '{k}': {exc}")

    @staticmethod
    def from_local(user_cls, app: "modal.app._App", class_service_function: _Function) -> "_Cls":
        """mdmd:hidden"""
        # validate signature
        _Cls.validate_construction_mechanism(user_cls)

        lifecycle_method_partials = _find_partial_methods_for_user_cls(
            user_cls, ~_PartialFunctionFlags.interface_flags()
        )

        method_partials = _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.interface_flags())

        # Get all callables
        callables: dict[str, Callable] = {
            k: pf.raw_f
            for k, pf in _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.all()).items()
            if pf.raw_f is not None  # Should be true for _find_partial_methods output, but hard to annotate
        }

        def _deps() -> list[_Function]:
            return [class_service_function]

        async def _load(self: "_Cls", resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]):
            req = api_pb2.ClassCreateRequest(
                app_id=load_context.app_id, existing_class_id=existing_object_id, only_class_function=True
            )
            resp = await load_context.client.stub.ClassCreate(req)
            self._hydrate(resp.class_id, load_context.client, resp.handle_metadata)

        rep = f"Cls({user_cls.__name__})"
        # Pass a *reference* to the App's LoadContext - this is important since the App is
        # the only way to infer a LoadContext for an `@app.cls`, and the App doesn't
        # get its client until *after* the Cls is created.
        cls: _Cls = _Cls._from_loader(_load, rep, deps=_deps, load_context_overrides=app._root_load_context)
        cls._app = app
        cls._user_cls = user_cls
        cls._class_service_function = class_service_function
        cls._method_partials = method_partials
        cls._callables = callables
        cls._name = user_cls.__name__
        return cls

    @classmethod
    def from_name(
        cls: type["_Cls"],
        app_name: str,
        name: str,
        *,
        namespace: Any = None,  # mdmd:line-hidden
        environment_name: Optional[str] = None,
        client: Optional["_Client"] = None,
    ) -> "_Cls":
        """Reference a Cls from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        Model = modal.Cls.from_name("other-app", "Model")
        ```
        """
        warn_if_passing_namespace(namespace, "modal.Cls.from_name")

        async def _load_remote(
            self: _Cls, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            request = api_pb2.ClassGetRequest(
                app_name=app_name,
                object_tag=name,
                environment_name=load_context.environment_name,
                only_class_function=True,
            )
            try:
                response = await load_context.client.stub.ClassGet(request)
            except NotFoundError as exc:
                env_context = (
                    f" (in the '{load_context.environment_name}' environment)" if load_context.environment_name else ""
                )
                raise NotFoundError(
                    f"Lookup failed for Cls '{name}' from the '{app_name}' app{env_context}: {exc}."
                ) from None

            print_server_warnings(response.server_warnings)
            await resolver.load(self._class_service_function, load_context)
            self._hydrate(response.class_id, load_context.client, response.handle_metadata)

        environment_rep = f", environment_name={environment_name!r}" if environment_name else ""
        rep = f"Cls.from_name({app_name!r}, {name!r}{environment_rep})"

        load_context_overrides = LoadContext(client=client, environment_name=environment_name)
        cls = cls._from_loader(
            _load_remote,
            rep,
            is_another_app=True,
            hydrate_lazily=True,
            load_context_overrides=load_context_overrides,
        )

        class_service_name = f"{name}.*"  # special name of the base service function for the class
        cls._class_service_function = _Function._from_name(
            app_name,
            class_service_name,
            load_context_overrides=load_context_overrides,
        )
        cls._name = name
        return cls

    @warn_on_renamed_autoscaler_settings
    def with_options(
        self: "_Cls",
        *,
        cpu: Optional[Union[float, tuple[float, float]]] = None,
        memory: Optional[Union[int, tuple[int, int]]] = None,
        gpu: GPU_T = None,
        env: Optional[dict[str, Optional[str]]] = None,
        secrets: Optional[Collection[_Secret]] = None,
        volumes: dict[Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]] = {},
        retries: Optional[Union[int, Retries]] = None,
        max_containers: Optional[int] = None,  # Limit on the number of containers that can be concurrently running.
        buffer_containers: Optional[int] = None,  # Additional containers to scale up while Function is active.
        scaledown_window: Optional[int] = None,  # Max amount of time a container can remain idle before scaling down.
        timeout: Optional[int] = None,
        region: Optional[Union[str, Sequence[str]]] = None,  # Region or regions to run the function on.
        cloud: Optional[str] = None,  # Cloud provider to run the function on. Possible values are aws, gcp, oci, auto.
        # The following parameters are deprecated
        concurrency_limit: Optional[int] = None,  # Now called `max_containers`
        container_idle_timeout: Optional[int] = None,  # Now called `scaledown_window`
        allow_concurrent_inputs: Optional[int] = None,  # See `.with_concurrency`
    ) -> "_Cls":
        """Override the static Function configuration at runtime.

        This method will return a new instance of the cls that will autoscale independently of the
        original instance. Note that options cannot be "unset" with this method (i.e., if a GPU
        is configured in the `@app.cls()` decorator, passing `gpu=None` here will not create a
        CPU-only instance).

        **Usage:**

        You can use this method after looking up the Cls from a deployed App or if you have a
        direct reference to a Cls from another Function or local entrypoint on its App:

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100")
        ModelUsingGPU().generate.remote(input_prompt)  # Run with an A100 GPU
        ```

        The method can be called multiple times to "stack" updates:

        ```python notest
        Model.with_options(gpu="A100").with_options(scaledown_window=300)  # Use an A100 with slow scaledown
        ```

        Note that container arguments (i.e. `volumes` and `secrets`) passed in subsequent calls
        will not be merged.
        """
        retry_policy = _parse_retries(retries, f"Class {self.__name__}" if self._user_cls else "")
        if gpu or cpu or memory:
            resources = convert_fn_config_to_resources_config(cpu=cpu, memory=memory, gpu=gpu, ephemeral_disk=None)
        else:
            resources = None

        if allow_concurrent_inputs is not None:
            deprecation_warning(
                (2025, 5, 9),
                "The `allow_concurrent_inputs` argument is deprecated;"
                " please use the `.with_concurrency` method instead.",
            )

        # Validate volumes
        validated_volumes = validate_volumes(volumes)
        cloud_bucket_mounts = [(k, v) for k, v in validated_volumes if isinstance(v, _CloudBucketMount)]
        validated_volumes_no_cloud_buckets = [(k, v) for k, v in validated_volumes if isinstance(v, _Volume)]

        secrets = secrets or []
        if env:
            secrets = [*secrets, _Secret.from_dict(env)]

        scheduler_placement: Optional[api_pb2.SchedulerPlacement] = None
        if region:
            regions = [region] if isinstance(region, str) else list(region)
            scheduler_placement = api_pb2.SchedulerPlacement(regions=regions)

        new_options = _ServiceOptions(
            secrets=secrets,
            validated_volumes=validated_volumes_no_cloud_buckets,
            cloud_bucket_mounts=cloud_bucket_mounts,
            resources=resources,
            retry_policy=retry_policy,
            max_containers=max_containers,
            buffer_containers=buffer_containers,
            scaledown_window=scaledown_window,
            timeout_secs=timeout,
            scheduler_placement=scheduler_placement,
            cloud=cloud,
            # Note: set both for backwards / forwards compatibility
            # But going forward `.with_concurrency` is the preferred method with distinct parameterization
            max_concurrent_inputs=allow_concurrent_inputs,
            target_concurrent_inputs=allow_concurrent_inputs,
        )

        combined_options = self._options.merge_options(new_options)

        async def _load_from_base(new_cls, resolver, load_context, existing_object_id):
            # this is a bit confusing, the cls will always have the same metadata
            # since it has the same *class* service function (i.e. "template")
            # But the (instance) service function for each Obj will be different
            # since it will rebind to whatever `_options` have been assigned on
            # the particular Cls parent
            if not self.is_hydrated:
                # this should only happen for Cls.from_name instances
                # other classes should already be hydrated!
                await resolver.load(self, load_context)

            new_cls._initialize_from_other(self)
            # Restore the merged options after _initialize_from_other overwrites them
            new_cls._options = combined_options

        def _deps():
            return []

        new_cls = _Cls._from_loader(
            _load_from_base,
            rep=f"{self._name}.with_options(...)",
            is_another_app=True,
            deps=_deps,
            load_context_overrides=self._load_context_overrides,
            hydrate_lazily=True,
        )
        new_cls._initialize_from_other(self)
        new_cls._options = combined_options
        return new_cls

    def with_concurrency(self: "_Cls", *, max_inputs: int, target_inputs: Optional[int] = None) -> "_Cls":
        """Create an instance of the Cls with input concurrency enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_concurrency(max_inputs=100)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        concurrency_options = _ServiceOptions(max_concurrent_inputs=max_inputs, target_concurrent_inputs=target_inputs)
        combined_options = self._options.merge_options(concurrency_options)

        async def _load_from_base(new_cls, resolver, load_context, existing_object_id):
            if not self.is_hydrated:
                await resolver.load(self, load_context)
            new_cls._initialize_from_other(self)
            # Restore the merged options after _initialize_from_other overwrites them
            new_cls._options = combined_options

        def _deps():
            return []

        new_cls = _Cls._from_loader(
            _load_from_base,
            rep=f"{self._name}.with_concurrency(...)",
            is_another_app=True,
            deps=_deps,
            load_context_overrides=self._load_context_overrides,
            hydrate_lazily=True,
        )
        new_cls._initialize_from_other(self)
        new_cls._options = combined_options
        return new_cls

    def with_batching(self: "_Cls", *, max_batch_size: int, wait_ms: int) -> "_Cls":
        """Create an instance of the Cls with dynamic batching enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_batching(max_batch_size=100, batch_wait_ms=1000)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        batching_options = _ServiceOptions(batch_max_size=max_batch_size, batch_wait_ms=wait_ms)
        combined_options = self._options.merge_options(batching_options)

        async def _load_from_base(new_cls, resolver, load_context, existing_object_id):
            if not self.is_hydrated:
                await resolver.load(self, load_context)
            new_cls._initialize_from_other(self)
            # Restore the merged options after _initialize_from_other overwrites them
            new_cls._options = combined_options

        def _deps():
            return []

        new_cls = _Cls._from_loader(
            _load_from_base,
            rep=f"{self._name}.with_batching(...)",
            is_another_app=True,
            deps=_deps,
            load_context_overrides=self._load_context_overrides,
            hydrate_lazily=True,
        )
        new_cls._initialize_from_other(self)
        new_cls._options = combined_options
        return new_cls

    @synchronizer.no_input_translation
    def __call__(self, *args, **kwargs) -> _Obj:
        """This acts as the class constructor."""
        return _Obj(
            self,
            self._user_cls,
            self._options,
            args,
            kwargs,
        )

    def __getattr__(self, k):
        if self._user_cls is not None:
            # local class, we can check if there are static attributes and let the user access them
            # except if they are PartialFunction (i.e. methods)
            v = getattr(self._user_cls, k)
            if not isinstance(v, modal.partial_function.PartialFunction):
                return v

        # We create a synthetic dummy Function that is guaranteed to raise an AttributeError when
        # a user tries to use any of its "live methods" - this lets us raise exceptions for users
        # only if they try to access methods on a Cls as if they were methods on the instance.
        async def error_loader(
            fun: _Function, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            raise AttributeError(
                "You can't access methods on a Cls directly - Did you forget to instantiate the class first?\n"
                "e.g. instead of MyClass.method.remote(), do MyClass().method.remote()"
            )

        return _Function._from_loader(
            error_loader,
            rep=f"UnboundMethod({self._name}.{k})",
            deps=lambda: [],
            hydrate_lazily=True,
            load_context_overrides=self._load_context_overrides,
        )

    def _is_local(self) -> bool:
        return self._user_cls is not None


Cls = synchronize_api(_Cls)


@synchronize_api
async def _get_constructor_args(cls: _Cls) -> typing.Sequence[api_pb2.ClassParameterSpec]:
    # for internal use only - defined separately to not clutter Cls namespace
    await cls.hydrate()
    service_function = cls._get_class_service_function()
    metadata = service_function._metadata
    assert metadata
    if metadata.class_parameter_info.format != metadata.class_parameter_info.PARAM_SERIALIZATION_FORMAT_PROTO:
        raise InvalidError("Can only get constructor args for strictly parameterized classes")
    return metadata.class_parameter_info.schema


@synchronize_api
async def _get_method_schemas(cls: _Cls) -> dict[str, api_pb2.FunctionSchema]:
    # for internal use only - defined separately to not clutter Cls namespace
    await cls.hydrate()
    assert cls._method_metadata
    return {
        method_name: method_metadata.function_schema for method_name, method_metadata in cls._method_metadata.items()
    }


class _NO_DEFAULT:
    def __repr__(self):
        return "modal.cls._NO_DEFAULT()"


_no_default = _NO_DEFAULT()


class _Parameter:
    default: Any
    init: bool

    def __init__(self, default: Any, init: bool):
        self.default = default
        self.init = init

    def __get__(self, obj, obj_type=None) -> Any:
        if obj:
            if self.default is _no_default:
                raise AttributeError("field has no default value and no specified value")
            return self.default
        return self


def is_parameter(p: Any) -> bool:
    return isinstance(p, _Parameter) and p.init


def parameter(*, default: Any = _no_default, init: bool = True) -> Any:
    """Used to specify options for modal.cls parameters, similar to dataclass.field for dataclasses
    ```
    class A:
        a: str = modal.parameter()

    ```

    If `init=False` is specified, the field is not considered a parameter for the
    Modal class and not used in the synthesized constructor. This can be used to
    optionally annotate the type of a field that's used internally, for example values
    being set by @enter lifecycle methods, without breaking type checkers, but it has
    no runtime effect on the class.
    """
    # has to return Any to be assignable to any annotation (https://github.com/microsoft/pyright/issues/5102)
    return _Parameter(default=default, init=init)
