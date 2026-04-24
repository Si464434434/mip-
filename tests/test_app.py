import io
import unittest
from pathlib import Path

from app import UPLOAD_FOLDER, app


VALID_CSV = """CustomerID,Annual Income (k$),Spending Score (1-100)\n1,15,39\n2,15,81\n3,16,6\n4,16,77\n5,17,40\n"""
INVALID_COLUMNS_CSV = """CustomerID,Age\n1,20\n2,30\n3,40\n4,50\n"""
TOO_SMALL_VALID_CSV = """Annual Income (k$),Spending Score (1-100)\n10,20\n11,30\n12,40\n"""


class AnalyzeEndpointTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def tearDown(self):
        upload_dir = Path(UPLOAD_FOLDER)
        if not upload_dir.exists():
            return
        for file_path in upload_dir.glob("test_*.csv"):
            file_path.unlink(missing_ok=True)

    def _post_csv(self, csv_text: str, filename: str = "test_input.csv", clusters: str = "auto"):
        data = {
            "clusters": clusters,
            "file": (io.BytesIO(csv_text.encode("utf-8")), filename),
        }
        return self.client.post("/analyze", data=data, content_type="multipart/form-data")

    def test_home_page_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Customer segmentation", response.data)

    def test_analyze_requires_file(self):
        response = self.client.post("/analyze", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)

    def test_analyze_rejects_non_csv(self):
        data = {
            "clusters": "auto",
            "file": (io.BytesIO(b"hello"), "test_bad.txt"),
        }
        response = self.client.post("/analyze", data=data, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)

    def test_analyze_rejects_missing_required_columns(self):
        response = self._post_csv(INVALID_COLUMNS_CSV, filename="test_missing_cols.csv")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)
        self.assertIn("Annual Income", payload["error"])

    def test_analyze_rejects_too_few_valid_rows(self):
        response = self._post_csv(TOO_SMALL_VALID_CSV, filename="test_too_small.csv")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)
        self.assertIn("at least 4", payload["error"])

    def test_analyze_auto_mode_success(self):
        response = self._post_csv(VALID_CSV, filename="test_auto.csv", clusters="auto")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertIn("points", payload)
        self.assertIn("clusters", payload)
        self.assertIn("clusterLabels", payload)
        self.assertIn("selectedClusters", payload)
        self.assertIn("maxClusters", payload)
        self.assertIn("elbow", payload)

        self.assertGreaterEqual(payload["selectedClusters"], 2)
        self.assertGreaterEqual(len(payload["points"]), 4)

    def test_analyze_manual_cluster_success(self):
        response = self._post_csv(VALID_CSV, filename="test_manual.csv", clusters="2")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["selectedClusters"], 2)

    def test_analyze_manual_cluster_too_low(self):
        response = self._post_csv(VALID_CSV, filename="test_low_cluster.csv", clusters="1")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)
        self.assertIn("at least 2", payload["error"])

    def test_analyze_manual_cluster_too_high_for_data(self):
        response = self._post_csv(VALID_CSV, filename="test_high_cluster.csv", clusters="8")
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("error", payload)
        self.assertIn("cannot exceed", payload["error"])


if __name__ == "__main__":
    unittest.main()
