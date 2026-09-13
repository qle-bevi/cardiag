#!/usr/bin/env bash
# Run from any directory in WSL. Windows owns dependencies and build artifacts.
set -euo pipefail

mode=run
demo=()
for argument in "$@"; do
  case "$argument" in
    --demo) demo=(-Demo) ;;
    --check) mode=check ;;
    --prepare) mode=prepare ;;
    --sync-only) mode=sync ;;
    -h|--help)
      printf '%s\n' 'Usage : ./scripts/windows.sh [--demo] [--check | --prepare | --sync-only]' \
        '  Sans option : synchronise, installe les dépendances et lance Cardiag sous Windows.' \
        '  --demo      : active la démo au lancement.' \
        '  --check     : vérifie les outils Windows sans copier ni compiler.' \
        '  --prepare   : synchronise et installe les dépendances, sans lancer ni compiler.' \
        '  --sync-only : synchronise uniquement les sources.'
      exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$argument" >&2; exit 2 ;;
  esac
done
for command in powershell.exe wslpath rsync flock; do
  command -v "$command" >/dev/null || { printf 'Commande nécessaire introuvable : %s (lancer ce script depuis WSL).\n' "$command" >&2; exit 1; }
done
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
windows_local=$(powershell.exe -NoProfile -NonInteractive -Command '[Environment]::GetFolderPath("LocalApplicationData")' | tr -d '\r')
[[ -n "$windows_local" ]] || { printf 'Profil Windows introuvable.\n' >&2; exit 1; }
# A dedicated mirror; never synchronize into the user's Windows checkout.
source_id="${WSL_DISTRO_NAME:-WSL}:$source_dir"
source_hash=$(printf '%s' "$source_id" | sha256sum | cut -c1-12)
windows_dir="${windows_local}\\Cardiag\\wsl-${source_hash}"
destination=$(wslpath -u "$windows_dir")
source_script=$(wslpath -w "$source_dir/scripts/windows.ps1")

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$source_script" -ProjectPath "$windows_dir" -CheckOnly
[[ "$mode" != check ]] || exit 0

marker="$destination/.cardiag-wsl-source"
if [[ -e "$destination" ]]; then
  [[ -f "$marker" && "$(cat "$marker")" == "$source_id" ]] || {
    printf 'Le dossier Windows existe sans marqueur correspondant ; aucune modification : %s\n' "$destination" >&2
    exit 1
  }
else
  mkdir -p -- "$destination"
  printf '%s\n' "$source_id" > "$marker"
fi
# Keep the lock until the Windows application exits to prevent concurrent builds.
exec 9>"$destination/.cardiag-wsl-lock"
flock -n 9 || { printf 'Un lancement Windows est déjà en cours pour ce projet.\n' >&2; exit 1; }
printf 'Synchronisation vers %s\n' "$windows_dir"
rsync -rt --delete-delay \
  --exclude='.git' --exclude='node_modules' --exclude='target' \
  --exclude='dist' --exclude='dist-ssr' --exclude='coverage' --exclude='logs' \
  --exclude='*.tsbuildinfo' --exclude='.cardiag-wsl-*' \
  "$source_dir/" "$destination/"
[[ "$mode" != sync ]] || exit 0

options=()
[[ "$mode" != prepare ]] || options=(-PrepareOnly)
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "${windows_dir}\\scripts\\windows.ps1" -ProjectPath "$windows_dir" \
  "${options[@]}" "${demo[@]}"
