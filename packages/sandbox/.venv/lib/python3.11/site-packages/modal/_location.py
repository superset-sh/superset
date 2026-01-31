# Copyright Modal Labs 2022
import modal_proto.api_pb2


def display_location(cloud_provider: "modal_proto.api_pb2.CloudProvider.V") -> str:
    if cloud_provider == modal_proto.api_pb2.CLOUD_PROVIDER_GCP:
        return "GCP (us-east1)"
    elif cloud_provider == modal_proto.api_pb2.CLOUD_PROVIDER_AWS:
        return "AWS (us-east-1)"
    else:
        return ""
