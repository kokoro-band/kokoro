{
  description = "Kokoro dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-unfree.url = "github:numtide/nixpkgs-unfree/nixos-unstable";
    nixpkgs-unfree.inputs.nixpkgs.follows = "nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
    nix-vite-plus.url = "github:ryoppippi/nix-vite-plus";
    nix-vite-plus.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unfree,
      flake-utils,
      nix-vite-plus,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        unfreePkgs = nixpkgs-unfree.legacyPackages.${system};

        unityHubSources = {
          "aarch64-darwin" = {
            url = "https://public-cdn.cloud.unity3d.com/hub/prod/3.21.2/UnityHubSetup-3.21.2-arm64.dmg";
            hash = "sha256-H4iB/RuYWiuUU4f+tL6J2sleXXVKWOf3LAYS3PlVLs8=";
          };
          "x86_64-darwin" = {
            url = "https://public-cdn.cloud.unity3d.com/hub/prod/3.21.2/UnityHubSetup-3.21.2-x64.dmg";
            hash = "sha256-POqNRFlqyiLw/cmmcU5waP6L8MApU2tBMZCizbZjaEo=";
          };
        };
        unityHubSource = unityHubSources.${system} or null;

        unityHub =
          if unityHubSource != null then
            unfreePkgs.stdenvNoCC.mkDerivation {
              pname = "unityhub";
              version = "3.21.2";

              src = unfreePkgs.fetchurl {
                inherit (unityHubSource) url hash;
              };

              nativeBuildInputs = [ unfreePkgs.undmg ];
              sourceRoot = ".";

              installPhase = ''
                runHook preInstall

                mkdir -p "$out/Applications" "$out/bin"
                cp -R "Unity Hub.app" "$out/Applications/"
                cat > "$out/bin/unityhub" <<EOF
                #!${unfreePkgs.runtimeShell}
                exec "$out/Applications/Unity Hub.app/Contents/MacOS/Unity Hub" "\$@"
                EOF
                chmod +x "$out/bin/unityhub"

                runHook postInstall
              '';

              dontFixup = true;

              meta = with unfreePkgs.lib; {
                description = "Official Unity Hub";
                homepage = "https://unity.com/unity-hub";
                license = licenses.unfree;
                platforms = builtins.attrNames unityHubSources;
              };
            }
          else if system == "x86_64-linux" then
            unfreePkgs.unityhub
          else
            null;

        unityCliSources = {
          "aarch64-darwin" = {
            filename = "unity-darwin-arm64";
            hash = "sha256-RZ1oMKQR34bp2wV5uAOTLwxrwu/2p6tIM4XxZ2/ash8=";
          };
          "x86_64-darwin" = {
            filename = "unity-darwin-x64";
            hash = "sha256-XpiYkUTdJKC3TNsqXKCGdOHsf2hH/qA+6s1+621M0ZY=";
          };
          "aarch64-linux" = {
            filename = "unity-linux-arm64";
            hash = "sha256-Z3WydFM7lKVqzJScOoAjPcFdXFISfZuj9pGC+TH84Ns=";
          };
          "x86_64-linux" = {
            filename = "unity-linux-x64";
            hash = "sha256-jA1uJDVEnIvn8OayzmMwv8XxepiuxLZZyFmUBFXdD+U=";
          };
        };
        unityCliSource = unityCliSources.${system};

        unityCli = unfreePkgs.stdenvNoCC.mkDerivation {
          pname = "unity-cli";
          version = "1.0.0-beta.9";

          src = unfreePkgs.fetchurl {
            url = "https://public-cdn.cloud.unity3d.com/hub/prod/cli/1.0.0-beta.9/${unityCliSource.filename}";
            inherit (unityCliSource) hash;
          };

          dontUnpack = true;
          installPhase = ''
            runHook preInstall
            mkdir -p "$out/bin"
            cp "$src" "$out/bin/unity"
            chmod +x "$out/bin/unity"
            runHook postInstall
          '';

          meta = with unfreePkgs.lib; {
            description = "Official standalone Unity CLI";
            homepage = "https://docs.unity3d.com/hub/unity-cli";
            license = licenses.unfree;
            platforms = builtins.attrNames unityCliSources;
            mainProgram = "unity";
          };
        };

        unityArchitecture = if pkgs.stdenv.hostPlatform.isAarch64 then "arm64" else "x86_64";

        unityInstall = pkgs.writeShellApplication {
          name = "unity-install";
          runtimeInputs = [
            unityCli
            pkgs.gnugrep
            pkgs.sqlite
          ];
          text = ''
            state_db="$HOME/Library/Application Support/UnityHub/install-state/install-state.db"

            if [ -f "$state_db" ]; then
              sqlite3 "$state_db" "PRAGMA wal_checkpoint(FULL);" >/dev/null
              if [ ! -f "$state_db.pre-beta9.bak" ]; then
                sqlite3 "$state_db" ".backup '$state_db.pre-beta9.bak'"
              fi

              for table in downloads installs; do
                if ! sqlite3 "$state_db" \
                  "SELECT 1 FROM pragma_table_info('$table') WHERE name = 'writer_kind';" \
                  | grep -q 1; then
                  sqlite3 "$state_db" \
                    "ALTER TABLE $table ADD COLUMN writer_kind TEXT CHECK(writer_kind IN ('hub','hub-native','cli'));"
                fi
              done

              sqlite3 "$state_db" \
                "DELETE FROM downloads WHERE version = '6000.3.23f1' AND state = 'failed';"
            fi

            echo "Installing Unity 6000.3.23f1 with WebGL Build Support..."
            exec unity install 6000.3.23f1 \
              --architecture ${unityArchitecture} \
              --changeset 09d2ecc7fb28 \
              --module webgl \
              --yes \
              --accept-eula
          '';
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages =
            (with pkgs; [
              git-lfs
              unityCli
              unityInstall
            ])
            ++ [ nix-vite-plus.packages.${system}.vp ]
            ++ pkgs.lib.optionals (unityHub != null) [ unityHub ];

          shellHook = ''
            cat <<'EOF'
             _  __     _
            | |/ /    | |
            | ' / ___ | | _____  _ __ ___
            |  < / _ \| |/ / _ \| '__/ _ \
            | . \ (_) |   < (_) | | | (_) |
            |_|\_\___/|_|\_\___/|_|  \___/
            EOF

            eval "$(vp env print node)"
          '';
        };

        formatter = pkgs.nixfmt-tree;
      }
    );
}
