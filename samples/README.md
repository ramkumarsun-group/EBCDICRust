# EBCDIC sample files

Four distinct EBCDIC data files paired with their COBOL copybooks. Drop any
`.bin` / `.dat` into the EBCDIC Viewer via **Open**, then bind the matching
copybook from the sidebar to interpret the records.

| Set | Data file | Copybook | What it exercises | Source |
|---|---|---|---|---|
| `ibm_employees/` | `EMPLOYEES.bin` (22 K) | `EMPLOYEES.cpy` | `PIC S9(4) COMP` binary id, `PIC 9(5) COMP-3` packed-decimal, `OCCURS … DEPENDING ON` variable arrays | [IBM datastage-standalone-workshop](https://github.com/IBM/datastage-standalone-workshop/tree/master/data/mainframe) |
| `cobrix_companies/` | `COMPANIES.dat` (64 K) | `COMPANIES.cpy` | `REDEFINES` for str-vs-COMP overlay, taxpayer union, fixed-length 100-byte records | [AbsaOSS/cobrix](https://github.com/AbsaOSS/cobrix/tree/master/examples/example_data) |
| `cobrix_data_types/` | `DATA_TYPES.dat` (131 K) | `DATA_TYPES.cpy` | Every numeric edge case — `BINARY`, `PIC 9` / `PIC S9`, signed/unsigned, all widths from 1 to 37 digits | [AbsaOSS/cobrix](https://github.com/AbsaOSS/cobrix/tree/master/examples/example_data) |
| `cobrix_codec/` | `CODEC.dat` (71 K) | `CODEC.cob` | Same record shape as `companies` but **ASCII-encoded** data — good for testing the CP-037 vs CP-1047 switch and confirming non-EBCDIC bytes are handled | [AbsaOSS/cobrix](https://github.com/AbsaOSS/cobrix/tree/master/examples/example_data) |

## Quick tour

1. **Start with `ibm_employees/EMPLOYEES.bin`** — smallest, has packed-decimal
   and variable-length arrays. Open it, then click `EMPLOYEES.cpy` in the
   copybook list.
2. **Try `cobrix_data_types/DATA_TYPES.dat`** — wide hex view; the new
   horizontal scrollbar gets a workout here because the layout pane is bound.
3. **Compare `companies` vs `codec`** — they share a copybook structure, but
   `codec` data is ASCII-encoded, so toggling the codepage in Settings should
   look obviously wrong on one and right on the other.

All files are from public Apache-2.0 / open-source projects, redistributed
for testing only.
