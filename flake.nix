{
  description = "Kokoro dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nix-vite-plus.url = "github:ryoppippi/nix-vite-plus";
    nix-vite-plus.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      nix-vite-plus,
    }:
    flake-utils.lib.eachSystem
      [
        "aarch64-darwin"
        "x86_64-linux"
      ]
      (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          devShells.default = pkgs.mkShell {
            packages =
              (with pkgs; [
                git-lfs
                jdk17_headless
                ollama
              ])
              ++ [ nix-vite-plus.packages.${system}.vp ];

            # Ollama browser access: docs/ai/local-ollama-setup.md.
            OLLAMA_ORIGINS = "http://localhost:5173,https://kokoro-band.github.io";

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
