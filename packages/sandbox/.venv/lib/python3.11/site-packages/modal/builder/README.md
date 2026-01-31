# Modal Image builder configuration

This directory contains `modal.Image` specifications that vary across
"image builder" versions.

The `base-images.json` file specifies the versions used for Modal's
various `Image` constructor methods.

The versioned requirements files enumerate the dependencies needed by
the Modal client library when it is running inside a Modal container.

The container requirements are a subset of the dependencies required by the
client for local operation (i.e., to run or deploy Modal apps). Additionally,
we aim to pin specific versions rather than allowing a range as we do for the
installation dependencies.

From version `2024.04`, the requirements specify the entire dependency tree,
and not just the first-order dependencies.

Note that for `2023.12`, there is a separate requirements file that is used for
Python 3.12.