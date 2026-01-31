from typing import Dict, Any
import sys

PY314 = sys.version_info >= (3, 14)


def get_annotations(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get annotations compatible with Python 3.14's deferred annotations."""

    # This recipe was inferred from
    # https://docs.python.org/3.14/library/annotationlib.html#recipes
    annotations: Dict[str, Any]
    if "__annotations__" in params:
        annotations = params["__annotations__"]
        return annotations
    elif PY314:
        # annotationlib introduced in Python 3.14 to inspect annotations
        import annotationlib

        annotate = annotationlib.get_annotate_from_class_namespace(params)
        if annotate is None:
            return {}
        annotations = annotationlib.call_annotate_function(
            annotate, format=annotationlib.Format.FORWARDREF
        )
        return annotations
    else:
        return {}
