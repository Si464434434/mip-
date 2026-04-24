from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from model import analyze_customers

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / "uploads"
ALLOWED_EXTENSIONS = {"csv"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    uploaded_file = request.files.get("file")
    cluster_mode = (request.form.get("clusters") or "auto").strip().lower()

    if uploaded_file is None or uploaded_file.filename == "":
        return jsonify({"error": "No file uploaded. Please choose a CSV file."}), 400

    if not allowed_file(uploaded_file.filename):
        return jsonify({"error": "Invalid file format. Please upload a CSV file."}), 400

    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    safe_name = secure_filename(uploaded_file.filename) or "customers.csv"
    saved_path = UPLOAD_FOLDER / safe_name
    uploaded_file.save(saved_path)

    try:
        cluster_count = None
        if cluster_mode != "auto":
            cluster_count = int(cluster_mode)
        analysis = analyze_customers(saved_path, n_clusters=cluster_count)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        return jsonify({"error": "An unexpected error occurred while processing the file."}), 500

    return jsonify(analysis)


if __name__ == "__main__":
    app.run(debug=True)
