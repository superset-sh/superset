#!/bin/bash
# DEPRECATED: This script is no longer needed for port management.
# Ports are now automatically managed by the Electron app.
# This script is kept for backward compatibility but does nothing useful.
# 
# The app automatically finds available ports (4927-4999) and persists
# them in ~/.superset/dev-port.json

set -e

echo "⚠️  Note: Port management is now automatic. This script is deprecated."
echo "   The app will automatically select an available port when started."
echo "   No manual port configuration is needed."
