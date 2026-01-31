import modal.secret
import modal_proto.api_pb2
import typing

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
    bucket_endpoint_url: typing.Optional[str]
    key_prefix: typing.Optional[str]
    secret: typing.Optional[modal.secret._Secret]
    oidc_auth_role_arn: typing.Optional[str]
    read_only: bool
    requester_pays: bool
    force_path_style: bool

    def __init__(
        self,
        bucket_name: str,
        bucket_endpoint_url: typing.Optional[str] = None,
        key_prefix: typing.Optional[str] = None,
        secret: typing.Optional[modal.secret._Secret] = None,
        oidc_auth_role_arn: typing.Optional[str] = None,
        read_only: bool = False,
        requester_pays: bool = False,
        force_path_style: bool = False,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

def cloud_bucket_mounts_to_proto(
    mounts: typing.Sequence[tuple[str, _CloudBucketMount]],
) -> list[modal_proto.api_pb2.CloudBucketMount]:
    """Helper function to convert `CloudBucketMount` to a list of protobufs that can be passed to the server."""
    ...

class CloudBucketMount:
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
    bucket_endpoint_url: typing.Optional[str]
    key_prefix: typing.Optional[str]
    secret: typing.Optional[modal.secret.Secret]
    oidc_auth_role_arn: typing.Optional[str]
    read_only: bool
    requester_pays: bool
    force_path_style: bool

    def __init__(
        self,
        bucket_name: str,
        bucket_endpoint_url: typing.Optional[str] = None,
        key_prefix: typing.Optional[str] = None,
        secret: typing.Optional[modal.secret.Secret] = None,
        oidc_auth_role_arn: typing.Optional[str] = None,
        read_only: bool = False,
        requester_pays: bool = False,
        force_path_style: bool = False,
    ) -> None: ...
    def __repr__(self): ...
    def __eq__(self, other): ...
