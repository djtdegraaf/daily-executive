#!/bin/bash
# Generates the 4 landing pages from a shared template function

page_html() {
  local FILENAME="$1"
  local PAGE_ID="$2"
  local TITLE="$3"
  local ACTIVE_NAV="$4"
  local FEEDS="$5"
  local KEYWORDS="$6"
  local LEAD_LABEL="$7"
  local GRID_LABEL="$8"
  local SUBHEAD="$9"

  cat > "C:\Users\jcdm6\daily-executive\${FILENAME}" << HTML
...placeholder...
HTML
}
