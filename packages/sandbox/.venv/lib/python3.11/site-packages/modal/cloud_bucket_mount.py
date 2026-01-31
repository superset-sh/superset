# Copyright Modal Labs 2022
from dataclasses import dataclass
from typing import Optional, Sequence
from urllib.parse import urlparse

from modal_proto import api_pb2

from ._utils.async_utils import synchronize_api
from .config import logger
from .secret import _Secret


@dataclass
class _CloudBucketMount:
    """Mounts a cloud bucket to your container. Currently supports AWS S3 buckets.

    S3 buckets are mounted using [AWS S3 Mountpoint](https://github.com/awslabs/mountpoint-s3).
    S3 mounts are optimized for reading large files sequentially. It does not support every file operation; consult
    [the AWS S3 Mountpoint documentation](https://github.com/awslabs/mountpoint-s3/blob/main/doc/SEMANTICS.md)
    for more information.

    **AWS S3 Usage**

    ```python
    import subprocess

    app = modal.App()
    secret = modal.Secret.from_name(
        "aws-secret",
        required_keys=["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
        # Note: providing AWS_REGION can help when automatic detection of the bucket region fails.
    )

    @app.function(
        volumes={
            "/my-mount": modal.CloudBucketMount(
                bucket_name="s3-bucket-name",
                secret=secret,
                read_only=True
            )
        }
    )
    def f():
        subprocess.run(["ls", "/my-mount"], check=True)
    ```

    **Cloudflare R2 Usage**

    Cloudflare R2 is [S3-compatible](https://developers.cloudflare.com/r2/api/s3/api/) so its setup looks
    very similar to S3. But additionally the `bucket_endpoint_url` argument must be passed.

    ```python
    import subprocess

    app = modal.App()
    secret = modal.Secret.from_name(
        "r2-secret",
        required_keys=["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    )

    @app.function(
        volumes={
            "/my-mount": modal.CloudBucketMount(
                bucket_name="my-r2-bucket",
                bucket_endpoint_url="https://<ACCOUNT ID>.r2.cloudflarestorage.com",
                secret=secret,
                read_only=True
            )
        }
    )
    def f():
        subprocess.run(["ls", "/my-mount"], check=True)
    ```

    **Google GCS Usage**

    Google Cloud Storage (GCS) is [S3-compatible](https://cloud.google.com/storage/docs/interoperability).
    GCS Buckets also require a secret with Google-specific key names (see below) populated with
    a [HMAC key](https://cloud.google.com/storage/docs/authentication/managing-hmackeys#create).

    ```python
    import subprocess

    app = modal.App()
    gcp_hmac_secret = modal.Secret.from_name(
        "gcp-secret",
        required_keys=["GOOGLE_ACCESS_KEY_ID", "GOOGLE_ACCESS_KEY_SECRET"]
    )

    @app.function(
        volumes={
            "/my-mount": modal.CloudBucketMount(
                bucket_name="my-gcs-bucket",
                bucket_endpoint_url="https://storage.googleapis.com",
                secret=gcp_hmac_secret,
            )
        }
    )
    def f():
        subprocess.run(["ls", "/my-mount"], check=True)
    ```
    """

    bucket_name: str
    # Endpoint URL is used to support Cloudflare R2 and Google Cloud Platform GCS.
    bucket_endpoint_url: Optional[str] = None

    key_prefix: Optional[str] = None

    # Credentials used to access a cloud bucket.
    # If the bucket is private, the secret **must** contain AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
    # If the bucket is publicly accessible, the secret is unnecessary and can be omitted.
    secret: Optional[_Secret] = None

    # Role ARN used for using OIDC authentication to access a cloud bucket.
    oidc_auth_role_arn: Optional[str] = None

    read_only: bool = False
    requester_pays: bool = False
    force_path_style: bool = False


def cloud_bucket_mounts_to_proto(mounts: Sequence[tuple[str, _CloudBucketMount]]) -> list[api_pb2.CloudBucketMount]:
    """Helper function to convert `CloudBucketMount` to a list of protobufs that can be passed to the server."""
    cloud_bucket_mounts: list[api_pb2.CloudBucketMount] = []

    for path, mount in mounts:
        # crude mapping from mount arguments to type.
        if mount.bucket_endpoint_url:
            parse_result = urlparse(mount.bucket_endpoint_url)
            if parse_result.hostname.endswith("r2.cloudflarestorage.com"):
                bucket_type = api_pb2.CloudBucketMount.BucketType.R2
            elif parse_result.hostname.endswith("storage.googleapis.com"):
                bucket_type = api_pb2.CloudBucketMount.BucketType.GCP
            else:
                logger.info(
                    "CloudBucketMount received unrecognized bucket endpoint URL. "
                    "Assuming AWS S3 configuration as fallback."
                )
                bucket_type = api_pb2.CloudBucketMount.BucketType.S3
        else:
            # just assume S3; this is backwards and forwards compatible.
            bucket_type = api_pb2.CloudBucketMount.BucketType.S3

        if mount.requester_pays and not mount.secret:
            raise ValueError("Credentials required in order to use Requester Pays.")

        if mount.key_prefix and not mount.key_prefix.endswith("/"):
            raise ValueError("key_prefix will be prefixed to all object paths, so it must end in a '/'")
        else:
            key_prefix = mount.key_prefix

        cloud_bucket_mount = api_pb2.CloudBucketMount(
            bucket_name=mount.bucket_name,
            bucket_endpoint_url=mount.bucket_endpoint_url,
            mount_path=path,
            credentials_secret_id=mount.secret.object_id if mount.secret else "",
            read_only=mount.read_only,
            bucket_type=bucket_type,
            requester_pays=mount.requester_pays,
            key_prefix=key_prefix,
            oidc_auth_role_arn=mount.oidc_auth_role_arn,
            force_path_style=mount.force_path_style,
        )
        cloud_bucket_mounts.append(cloud_bucket_mount)

    return cloud_bucket_mounts


CloudBucketMount = synchronize_api(_CloudBucketMount)
