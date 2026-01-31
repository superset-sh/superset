import modal._object
import modal.client
import modal.object
import typing

class _Proxy(modal._object._Object):
    """Proxy objects give your Modal containers a static outbound IP address.

    This can be used for connecting to a remote address with network whitelist, for example
    a database. See [the guide](https://modal.com/docs/guide/proxy-ips) for more information.
    """
    @staticmethod
    def from_name(
        name: str,
        *,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Proxy:
        """Reference a Proxy by its name.

        In contrast to most other Modal objects, new Proxy objects must be
        provisioned via the Dashboard and cannot be created on the fly from code.
        """
        ...

class Proxy(modal.object.Object):
    """Proxy objects give your Modal containers a static outbound IP address.

    This can be used for connecting to a remote address with network whitelist, for example
    a database. See [the guide](https://modal.com/docs/guide/proxy-ips) for more information.
    """
    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @staticmethod
    def from_name(
        name: str, *, environment_name: typing.Optional[str] = None, client: typing.Optional[modal.client.Client] = None
    ) -> Proxy:
        """Reference a Proxy by its name.

        In contrast to most other Modal objects, new Proxy objects must be
        provisioned via the Dashboard and cannot be created on the fly from code.
        """
        ...
