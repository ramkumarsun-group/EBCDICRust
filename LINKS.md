# EBCDIC Viewer — Links

## 📦 Repository
| | |
|---|---|
| **GitHub Repo** | https://github.com/ramkumarsun-group/EBCDICRust |

## 🌐 Documentation
| | |
|---|---|
| **Docs / Instructions page** | https://ramkumarsun-group.github.io/EBCDICRust/ |

## 📥 Downloads
| | |
|---|---|
| **Latest release** | https://github.com/ramkumarsun-group/EBCDICRust/releases/latest |
| **v2.0.1 release** | https://github.com/ramkumarsun-group/EBCDICRust/releases/tag/v2.0.1 |

### Direct download links (v2.0.1)
| Platform | File |
|---|---|
| **macOS** (Apple Silicon + Intel) | [EBCDIC.Viewer_2.0.1_universal.dmg](https://github.com/ramkumarsun-group/EBCDICRust/releases/download/v2.0.1/EBCDIC.Viewer_2.0.1_universal.dmg) |
| **Windows** installer | [EBCDIC.Viewer_2.0.1_x64-setup.exe](https://github.com/ramkumarsun-group/EBCDICRust/releases/download/v2.0.1/EBCDIC.Viewer_2.0.1_x64-setup.exe) |
| **Windows** MSI (enterprise) | [EBCDIC.Viewer_2.0.1_x64_en-US.msi](https://github.com/ramkumarsun-group/EBCDICRust/releases/download/v2.0.1/EBCDIC.Viewer_2.0.1_x64_en-US.msi) |

## ⚠️ Troubleshooting

### macOS — "EBCDIC Viewer Not Opened" / Apple cannot verify
This appears because the app is not yet code-signed. To fix it:
1. Click **Done** (not "Move to Trash")
2. Open **Terminal** and run:
   ```bash
   xattr -cr "/Applications/EBCDIC Viewer.app"
   ```
3. Double-click the app — it will open normally from now on

> This is a one-time step. macOS quarantines apps downloaded from the internet that are not signed by an Apple-registered developer.

### Windows — SmartScreen warning ("Windows protected your PC")
This appears because the app is not yet code-signed. To bypass it:
1. Click **More info**
2. Click **Run anyway**

## 🍺 Homebrew (macOS)
| | |
|---|---|
| **Homebrew tap repo** | https://github.com/ramkumarsun-group/homebrew-tap |

```bash
brew tap ramkumarsun-group/tap
brew install --cask ebcdic-viewer
```

## ⚙️ CI / Build
| | |
|---|---|
| **GitHub Actions** | https://github.com/ramkumarsun-group/EBCDICRust/actions |
