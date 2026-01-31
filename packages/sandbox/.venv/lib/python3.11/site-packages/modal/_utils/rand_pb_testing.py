# Copyright Modal Labs 2023
"""Utilities to generate random valid Protobuf messages for testing.

This is based on https://github.com/yupingso/randomproto but customizable for
Modal, with random seeds, and it supports oneofs, and Protobuf v4.
"""

import string
from random import Random
from typing import Any, Callable, Optional, TypeVar, Union

from google.protobuf.descriptor import Descriptor, FieldDescriptor

T = TypeVar("T")

_FIELD_RANDOM_GENERATOR: dict[int, Callable[[Random], Any]] = {
    FieldDescriptor.TYPE_DOUBLE: lambda rand: rand.normalvariate(0, 1),
    FieldDescriptor.TYPE_FLOAT: lambda rand: rand.normalvariate(0, 1),
    FieldDescriptor.TYPE_INT32: lambda rand: int.from_bytes(rand.randbytes(4), "little", signed=True),
    FieldDescriptor.TYPE_INT64: lambda rand: int.from_bytes(rand.randbytes(8), "little", signed=True),
    FieldDescriptor.TYPE_UINT32: lambda rand: int.from_bytes(rand.randbytes(4), "little"),
    FieldDescriptor.TYPE_UINT64: lambda rand: int.from_bytes(rand.randbytes(8), "little"),
    FieldDescriptor.TYPE_SINT32: lambda rand: int.from_bytes(rand.randbytes(4), "little", signed=True),
    FieldDescriptor.TYPE_SINT64: lambda rand: int.from_bytes(rand.randbytes(8), "little", signed=True),
    FieldDescriptor.TYPE_FIXED32: lambda rand: int.from_bytes(rand.randbytes(4), "little"),
    FieldDescriptor.TYPE_FIXED64: lambda rand: int.from_bytes(rand.randbytes(8), "little"),
    FieldDescriptor.TYPE_SFIXED32: lambda rand: int.from_bytes(rand.randbytes(4), "little", signed=True),
    FieldDescriptor.TYPE_SFIXED64: lambda rand: int.from_bytes(rand.randbytes(8), "little", signed=True),
    FieldDescriptor.TYPE_BOOL: lambda rand: rand.choice([True, False]),
    FieldDescriptor.TYPE_STRING: lambda rand: "".join(
        rand.choice(string.printable) for _ in range(int(rand.expovariate(0.15)))
    ),
    FieldDescriptor.TYPE_BYTES: lambda rand: rand.randbytes(int(rand.expovariate(0.15))),
}


def _fill(msg, desc: Descriptor, rand: Random) -> None:
    field: FieldDescriptor
    oneof_fields: set[str] = set()
    for oneof in desc.oneofs:
        oneof_field: Union[FieldDescriptor, None] = rand.choice(list(oneof.fields) + [None])
        if oneof_field is not None:
            oneof_fields.add(oneof_field.name)
    for field in desc.fields:
        if field.containing_oneof is not None and field.name not in oneof_fields:
            continue
        is_message = field.type == FieldDescriptor.TYPE_MESSAGE

        # In the C implemenation of protobuf for Python 3.14, it raises a depreation
        # warning when labels is accessed, but it does not clean up the exception state,
        # causing an SystemError.
        if hasattr(field, "is_repeated"):
            is_repeated = field.is_repeated  # type: ignore
        else:
            is_repeated = field.label == FieldDescriptor.LABEL_REPEATED
        if is_message:
            msg_field = getattr(msg, field.name)
            if is_repeated:
                num = rand.randint(0, 2)
                for _ in range(num):
                    element = msg_field.add()
                    _fill(element, field.message_type, rand)
            else:
                _fill(msg_field, field.message_type, rand)
        else:
            if field.type == FieldDescriptor.TYPE_ENUM:
                enum_values = [x.number for x in field.enum_type.values]
                generator = lambda rand: rand.choice(enum_values)  # noqa: E731

            else:
                generator = _FIELD_RANDOM_GENERATOR[field.type]
            if is_repeated:
                num = rand.randint(0, 2)
                msg_field = getattr(msg, field.name)
                for _ in range(num):
                    msg_field.append(generator(rand))
            else:
                setattr(msg, field.name, generator(rand))


def rand_pb(proto: type[T], rand: Optional[Random] = None) -> T:
    """Generate a pseudorandom protobuf message.

    ```python notest
    rand = random.Random(42)
    definition = rand_pb(api_pb2.Function, rand)
    ```
    """
    if rand is None:
        rand = Random(0)  # note: deterministic seed if not specified
    msg = proto()
    _fill(msg, proto.DESCRIPTOR, rand)  # type: ignore
    return msg
