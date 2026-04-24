# Customer Segmentation Testing Checklist

## 1. Manual Functional Checks

- [ ] Open app home page and confirm UI loads without console errors.
- [ ] Upload a valid CSV and confirm clustering success message is shown.
- [ ] Confirm scatter chart renders colored clusters.
- [ ] Confirm elbow chart renders and shows suggested cluster count.
- [ ] Confirm insights panel shows cluster count, average income, and average spending.

## 2. File Validation Checks

- [ ] Submit without file and confirm error: no file uploaded.
- [ ] Upload non-CSV file and confirm invalid format error.
- [ ] Upload CSV missing required columns and confirm validation error.
- [ ] Upload CSV with too few valid rows and confirm minimum row error.

## 3. Cluster Mode Checks

- [ ] Use `Auto` mode and confirm selected cluster count is returned.
- [ ] Use manual cluster mode `2` and confirm selected count is 2.
- [ ] Use manual cluster mode beyond allowed range and confirm error.
- [ ] Confirm elbow badge text updates for auto vs manual mode.

## 4. API Contract Checks (`POST /analyze`)

- [ ] Valid CSV returns HTTP 200 and JSON keys: `points`, `clusters`, `clusterLabels`, `selectedClusters`, `maxClusters`, `elbow`.
- [ ] Invalid request returns HTTP 400 with `error` message.
- [ ] Unexpected failure path returns HTTP 500 with generic message.

## 5. Edge Case Data Checks

- [ ] CSV with extra unrelated columns still works.
- [ ] CSV with mixed numeric/text values in required columns is cleaned correctly.
- [ ] CSV with blank rows is cleaned correctly.
- [ ] Re-upload same filename does not break analysis flow.

## 6. Performance Sanity Checks

- [ ] Confirm analysis completes in reasonable time on sample data.
- [ ] Confirm charts remain responsive with larger CSV files.

## 7. Automated Test Run

Run from project root:

```powershell
c:/Users/Lenovo/Desktop/6.0/Your-OWN-AI/.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Expected: all tests pass.
