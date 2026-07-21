# 1. Save changes
git add .
git commit -m "your changes"

# 2. Bump version (creates git tag automatically)
npm version patch

# 3. Build installers
npm run build:electron && npx electron-builder --linux --win
# 4. Push code + tag
git push --tags

gh release upload v1.0.1 release/CRAS-1.0.1_amd64.deb release/CRAS-1.0.1_x86_64.AppImage  release/latest-linux.yml