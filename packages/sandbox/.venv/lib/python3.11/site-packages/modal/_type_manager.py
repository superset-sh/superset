# Copyright Modal Labs 2025
import typing
from typing import Any

import typing_extensions

from modal.exception import InvalidError
from modal_proto import api_pb2


class ParameterProtoSerde(typing.Protocol):
    def encode(self, value: Any) -> api_pb2.ClassParameterValue: ...

    def decode(self, proto_value: api_pb2.ClassParameterValue) -> Any: ...

    def validate(self, python_value: Any): ...


class ProtoParameterSerdeRegistry:
    _py_base_type_to_serde: dict[type, ParameterProtoSerde]
    _proto_type_to_serde: dict["api_pb2.ParameterType.ValueType", ParameterProtoSerde]

    def __init__(self):
        self._py_base_type_to_serde = {}
        self._proto_type_to_serde = {}

    def register_encoder(self, python_base_type: type) -> typing.Callable[[ParameterProtoSerde], ParameterProtoSerde]:
        def deco(ph: ParameterProtoSerde) -> ParameterProtoSerde:
            if python_base_type in self._py_base_type_to_serde:
                raise ValueError("Can't register the same encoder type twice")
            self._py_base_type_to_serde[python_base_type] = ph
            return ph

        return deco

    def register_decoder(
        self, enum_type_value: "api_pb2.ParameterType.ValueType"
    ) -> typing.Callable[[ParameterProtoSerde], ParameterProtoSerde]:
        def deco(ph: ParameterProtoSerde) -> ParameterProtoSerde:
            if enum_type_value in self._proto_type_to_serde:
                raise ValueError("Can't register the same decoder type twice")
            self._proto_type_to_serde[enum_type_value] = ph
            return ph

        return deco

    def encode(self, python_value: Any) -> api_pb2.ClassParameterValue:
        return self._get_encoder(type(python_value)).encode(python_value)

    def supports_type(self, declared_type: type) -> bool:
        try:
            self._get_encoder(declared_type)
            return True
        except InvalidError:
            return False

    def decode(self, param_value: api_pb2.ClassParameterValue) -> Any:
        return self._get_decoder(param_value.type).decode(param_value)

    def validate_parameter_type(self, declared_type: type):
        """Raises a helpful TypeError if the supplied type isn't supported by class parameters"""
        if not parameter_serde_registry.supports_type(declared_type):
            supported_types = self._py_base_type_to_serde.keys()
            supported_str = ", ".join(t.__name__ for t in supported_types)

            raise TypeError(
                f"{declared_type.__name__} is not a supported modal.parameter() type. Use one of: {supported_str}"
            )

    def validate_value_for_enum_type(self, enum_value: "api_pb2.ParameterType.ValueType", python_value: Any):
        serde = self._get_decoder(enum_value)  # use the schema's expected decoder
        serde.validate(python_value)

    def _get_encoder(self, python_base_type: type) -> ParameterProtoSerde:
        try:
            return self._py_base_type_to_serde[python_base_type]
        except KeyError:
            raise InvalidError(f"No class parameter encoder implemented for type `{python_base_type.__name__}`")

    def _get_decoder(self, enum_value: "api_pb2.ParameterType.ValueType") -> ParameterProtoSerde:
        try:
            return self._proto_type_to_serde[enum_value]
        except KeyError:
            try:
                enum_name = api_pb2.ParameterType.Name(enum_value)
            except ValueError:
                enum_name = str(enum_value)

            raise InvalidError(f"No class parameter decoder implemented for type {enum_name}.")


parameter_serde_registry = ProtoParameterSerdeRegistry()


@parameter_serde_registry.register_encoder(int)
@parameter_serde_registry.register_decoder(api_pb2.PARAM_TYPE_INT)
class IntParameter:
    @staticmethod
    def encode(value: Any) -> api_pb2.ClassParameterValue:
        return api_pb2.ClassParameterValue(type=api_pb2.PARAM_TYPE_INT, int_value=value)

    @staticmethod
    def decode(proto_value: api_pb2.ClassParameterValue) -> int:
        return proto_value.int_value

    @staticmethod
    def validate(python_value: Any):
        if not isinstance(python_value, int):
            raise TypeError(f"Expected int, got {type(python_value).__name__}")


@parameter_serde_registry.register_encoder(str)
@parameter_serde_registry.register_decoder(api_pb2.PARAM_TYPE_STRING)
class StringParameter:
    @staticmethod
    def encode(value: Any) -> api_pb2.ClassParameterValue:
        return api_pb2.ClassParameterValue(type=api_pb2.PARAM_TYPE_STRING, string_value=value)

    @staticmethod
    def decode(proto_value: api_pb2.ClassParameterValue) -> str:
        return proto_value.string_value

    @staticmethod
    def validate(python_value: Any):
        if not isinstance(python_value, str):
            raise TypeError(f"Expected str, got {type(python_value).__name__}")


@parameter_serde_registry.register_encoder(bytes)
@parameter_serde_registry.register_decoder(api_pb2.PARAM_TYPE_BYTES)
class BytesParameter:
    @staticmethod
    def encode(value: Any) -> api_pb2.ClassParameterValue:
        return api_pb2.ClassParameterValue(type=api_pb2.PARAM_TYPE_BYTES, bytes_value=value)

    @staticmethod
    def decode(proto_value: api_pb2.ClassParameterValue) -> bytes:
        return proto_value.bytes_value

    @staticmethod
    def validate(python_value: Any):
        if not isinstance(python_value, bytes):
            raise TypeError(f"Expected bytes, got {type(python_value).__name__}")


@parameter_serde_registry.register_encoder(bool)
@parameter_serde_registry.register_decoder(api_pb2.PARAM_TYPE_BOOL)
class BoolParameter:
    @staticmethod
    def encode(value: Any) -> api_pb2.ClassParameterValue:
        return api_pb2.ClassParameterValue(type=api_pb2.PARAM_TYPE_BOOL, bool_value=value)

    @staticmethod
    def decode(proto_value: api_pb2.ClassParameterValue) -> bool:
        return proto_value.bool_value

    @staticmethod
    def validate(python_value: Any):
        if not isinstance(python_value, bool):
            raise TypeError(f"Expected bool, got {type(python_value).__name__}")


SCHEMA_FACTORY_TYPE = typing.Callable[[type], api_pb2.GenericPayloadType]


class SchemaRegistry:
    _schema_factories: dict[type, SCHEMA_FACTORY_TYPE]

    def __init__(self):
        self._schema_factories = {}

    def add(self, python_base_type: type) -> typing.Callable[[SCHEMA_FACTORY_TYPE], SCHEMA_FACTORY_TYPE]:
        # decorator for schema factory functions for a base type
        def deco(factory_func: SCHEMA_FACTORY_TYPE) -> SCHEMA_FACTORY_TYPE:
            assert python_base_type not in self._schema_factories
            self._schema_factories[python_base_type] = factory_func
            return factory_func

        return deco

    def get(self, python_base_type: type) -> SCHEMA_FACTORY_TYPE:
        try:
            return self._schema_factories[python_base_type]
        except KeyError:
            return unknown_type_schema

    def get_proto_generic_type(self, declared_type: type):
        if origin := typing_extensions.get_origin(declared_type):
            base_type = origin
        else:
            base_type = declared_type

        return self.get(base_type)(declared_type)


schema_registry = SchemaRegistry()


@schema_registry.add(int)
def int_schema(full_python_type: type) -> api_pb2.GenericPayloadType:
    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_INT,
    )


@schema_registry.add(bytes)
def proto_type_def(declared_python_type: type) -> api_pb2.GenericPayloadType:
    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_BYTES,
    )


def unknown_type_schema(declared_python_type: type) -> api_pb2.GenericPayloadType:
    # TODO: add some metadata for unknown types to the type def?
    return api_pb2.GenericPayloadType(base_type=api_pb2.PARAM_TYPE_UNKNOWN)


@schema_registry.add(str)
def str_schema(full_python_type: type) -> api_pb2.GenericPayloadType:
    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_STRING,
    )


@schema_registry.add(bool)
def bool_schema(full_python_type: type) -> api_pb2.GenericPayloadType:
    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_BOOL,
    )


@schema_registry.add(type(None))
def none_type_schema(declared_python_type: type) -> api_pb2.GenericPayloadType:
    return api_pb2.GenericPayloadType(base_type=api_pb2.PARAM_TYPE_NONE)


@schema_registry.add(list)
def list_schema(full_python_type: type) -> api_pb2.GenericPayloadType:
    args = typing_extensions.get_args(full_python_type)

    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_LIST, sub_types=[schema_registry.get_proto_generic_type(arg) for arg in args]
    )


@schema_registry.add(dict)
def dict_schema(full_python_type: type) -> api_pb2.GenericPayloadType:
    args = typing_extensions.get_args(full_python_type)

    return api_pb2.GenericPayloadType(
        base_type=api_pb2.PARAM_TYPE_DICT,
        sub_types=[schema_registry.get_proto_generic_type(arg_type) for arg_type in args],
    )
