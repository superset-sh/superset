#!/bin/bash
# =============================================================================
# Post-Create Script fuer Superset Fork DevContainer
# Wird nach dem Erstellen des Containers ausgefuehrt
# =============================================================================
set -euo pipefail

echo "==> Superset Fork DevContainer Setup"

# .env aus Secrets-Mount verlinken (falls vorhanden)
if [ -f /workspace/.env-secrets/.env ]; then
  echo "  -> .env aus Secrets-Mount verlinken"
  ln -sf /workspace/.env-secrets/.env /workspace/.env
else
  echo "  -> WARNUNG: Keine .env in ~/.secrets/superset-fork/ gefunden!"
  echo "     Kopiere .env.example als Vorlage:"
  echo "     cp .env.example ~/.secrets/superset-fork/.env"
  if [ -f /workspace/.env.example ] && [ ! -f /workspace/.env ]; then
    cp /workspace/.env.example /workspace/.env
    echo "  -> .env.example als .env kopiert (bitte Werte eintragen!)"
  fi
fi

# Bun install
echo "  -> bun install ausfuehren..."
cd /workspace
bun install

echo "==> Setup abgeschlossen!"
echo ""
echo "Nuetzliche Befehle:"
echo "  bun dev          - Alle Dev-Server starten"
echo "  bun run lint     - Lint pruefen"
echo "  bun run lint:fix - Lint automatisch fixen"
echo "  bun test         - Tests ausfuehren"
echo "  bun build        - Alles bauen"
