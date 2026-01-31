# This code is heavily based on grpcio-reflection reference implementation:
#
#     Copyright 2016 gRPC authors.
#
#     Licensed under the Apache License, Version 2.0 (the "License");
#     you may not use this file except in compliance with the License.
#     You may obtain a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#     Unless required by applicable law or agreed to in writing, software
#     distributed under the License is distributed on an "AS IS" BASIS,
#     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#     See the License for the specific language governing permissions and
#     limitations under the License.
#
from typing import TYPE_CHECKING, Any, Collection, List, Optional

from google.protobuf.descriptor import FileDescriptor
from google.protobuf.descriptor_pb2 import FileDescriptorProto
from google.protobuf.descriptor_pool import Default

from ..const import Status
from ..utils import _service_name
from ..server import Stream

from .v1.reflection_pb2 import ServerReflectionRequest, ServerReflectionResponse
from .v1.reflection_pb2 import ErrorResponse, ListServiceResponse
from .v1.reflection_pb2 import ServiceResponse, ExtensionNumberResponse
from .v1.reflection_pb2 import FileDescriptorResponse
from .v1.reflection_grpc import ServerReflectionBase

from ._deprecated import ServerReflection as _ServerReflectionV1Alpha


if TYPE_CHECKING:
    from .._typing import IServable  # noqa


class ServerReflection(ServerReflectionBase):
    """
    Implements server reflection protocol.
    """
    def __init__(
        self, *,
        _service_names: Collection[str],
        _pool: Optional[Any] = None
    ):
        self._service_names = _service_names
        # FIXME: DescriptorPool has incomplete typings
        self._pool = _pool or Default()  # type: ignore

    def _not_found_response(self) -> ServerReflectionResponse:
        return ServerReflectionResponse(
            error_response=ErrorResponse(
                error_code=Status.NOT_FOUND.value,
                error_message='not found',
            ),
        )

    def _file_descriptor_response(
        self,
        file_descriptor: FileDescriptor,
    ) -> ServerReflectionResponse:
        proto = FileDescriptorProto()
        file_descriptor.CopyToProto(proto)  # type: ignore
        return ServerReflectionResponse(
            file_descriptor_response=FileDescriptorResponse(
                file_descriptor_proto=[proto.SerializeToString()],
            ),
        )

    def _file_by_filename_response(
        self,
        file_name: str,
    ) -> ServerReflectionResponse:
        try:
            file = self._pool.FindFileByName(file_name)
        except KeyError:
            return self._not_found_response()
        else:
            return self._file_descriptor_response(file)

    def _file_containing_symbol_response(
        self,
        symbol: str,
    ) -> ServerReflectionResponse:
        try:
            file = self._pool.FindFileContainingSymbol(symbol)
        except KeyError:
            return self._not_found_response()
        else:
            return self._file_descriptor_response(file)

    def _file_containing_extension_response(
        self,
        msg_name: str,
        ext_number: int,
    ) -> ServerReflectionResponse:
        try:
            message = self._pool.FindMessageTypeByName(msg_name)
            extension = self._pool.FindExtensionByNumber(message, ext_number)
            file = self._pool.FindFileContainingSymbol(extension.full_name)
        except KeyError:
            return self._not_found_response()
        else:
            return self._file_descriptor_response(file)

    def _all_extension_numbers_of_type_response(
        self,
        type_name: str,
    ) -> ServerReflectionResponse:
        try:
            message = self._pool.FindMessageTypeByName(type_name)
            extensions = self._pool.FindAllExtensions(message)
        except KeyError:
            return self._not_found_response()
        else:
            return ServerReflectionResponse(
                all_extension_numbers_response=ExtensionNumberResponse(
                    base_type_name=message.full_name,
                    extension_number=[ext.number for ext in extensions],
                )
            )

    def _list_services_response(self) -> ServerReflectionResponse:
        return ServerReflectionResponse(
            list_services_response=ListServiceResponse(
                service=[ServiceResponse(name=service_name)
                         for service_name in self._service_names],
            )
        )

    async def ServerReflectionInfo(
        self,
        stream: Stream[ServerReflectionRequest, ServerReflectionResponse],
    ) -> None:
        async for request in stream:
            if request.HasField('file_by_filename'):
                response = self._file_by_filename_response(
                    request.file_by_filename,
                )
            elif request.HasField('file_containing_symbol'):
                response = self._file_containing_symbol_response(
                    request.file_containing_symbol,
                )
            elif request.HasField('file_containing_extension'):
                response = self._file_containing_extension_response(
                    request.file_containing_extension.containing_type,
                    request.file_containing_extension.extension_number,
                )
            elif request.HasField('all_extension_numbers_of_type'):
                response = self._all_extension_numbers_of_type_response(
                    request.all_extension_numbers_of_type,
                )
            elif request.HasField('list_services'):
                response = self._list_services_response()
            else:
                response = ServerReflectionResponse(
                    error_response=ErrorResponse(
                        error_code=Status.INVALID_ARGUMENT.value,
                        error_message='invalid argument',
                    )
                )
            await stream.send_message(response)

    @classmethod
    def extend(
        cls, services: 'Collection[IServable]',
        *,
        pool: Optional[Any] = None
    ) -> 'List[IServable]':
        """
        Extends services list with reflection service:

        .. code-block:: python3

            from grpclib.reflection.service import ServerReflection

            services = [Greeter()]
            services = ServerReflection.extend(services)

            server = Server(services)
            ...

        Returns new services list with reflection support added.
        """
        service_names = []
        for service in services:
            service_names.append(_service_name(service))
        services = list(services)
        services.append(cls(_service_names=service_names, _pool=pool))
        services.append(
            _ServerReflectionV1Alpha(_service_names=service_names, _pool=pool))
        return services
