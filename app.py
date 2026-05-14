import os
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from model import analyze_customers

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / "uploads"
ALLOWED_EXTENSIONS = {"csv"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")
app.config["LOGIN_USERNAME"] = os.environ.get("APP_LOGIN_USERNAME", "admin")
app.config["LOGIN_PASSWORD"] = os.environ.get("APP_LOGIN_PASSWORD", "admin123")


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_authenticated() -> bool:
    return bool(session.get("authenticated"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if is_authenticated():
        return redirect(url_for("home"))

    error = None

    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""

        if (
            username == app.config["LOGIN_USERNAME"]
            and password == app.config["LOGIN_PASSWORD"]
        ):
            session["authenticated"] = True
            session["username"] = username
            return redirect(url_for("home"))

        error = "Invalid username or password."

    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def home():
    if not is_authenticated():
        return redirect(url_for("login"))

    return render_template("index.html", username=session.get("username", "Admin"))


@app.route("/analyze", methods=["POST"])
def analyze():
    if not is_authenticated():
        return jsonify({"error": "Please log in to analyze a file."}), 401

    uploaded_file = request.files.get("file")
    cluster_mode = (request.form.get("clusters") or "auto").strip().lower()

    if uploaded_file is None or uploaded_file.filename == "":
        return jsonify({"error": "No file uploaded. Please choose a CSV file."}), 400

    if not allowed_file(uploaded_file.filename):
        return jsonify({"error": "Invalid file format. Please upload a CSV file."}), 400

    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    safe_name = secure_filename(uploaded_file.filename) or "customers.csv"
    saved_path = UPLOAD_FOLDER / safe_name
    try:
        # Save the uploaded file inside the try so save-related errors are
        # handled and returned as JSON instead of producing an HTML 500 page.
        uploaded_file.save(saved_path)

        cluster_count = None
        if cluster_mode != "auto":
            cluster_count = int(cluster_mode)
        analysis = analyze_customers(saved_path, n_clusters=cluster_count)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        return jsonify({"error": "An unexpected error occurred while processing the file."}), 500

    return jsonify(analysis)


@app.route("/predict", methods=["POST"])
def predict():
    if not is_authenticated():
        return jsonify({"error": "Please log in to predict a cluster."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request. Missing data."}), 400

    income = data.get("income")
    spending = data.get("spending")
    cluster_centers = data.get("clusterCenters")
    points = data.get("points")

    if None in [income, spending, cluster_centers, points]:
        return jsonify({"error": "Invalid request. Missing required fields."}), 400

    try:
        # Re-implement the prediction logic from script.js on the server
        incomes = [p["x"] for p in points]
        spendings = [p["y"] for p in points]
        income_min = min(incomes)
        income_max = max(incomes)
        spending_min = min(spendings)
        spending_max = max(spendings)
        income_range = max(1, income_max - income_min)
        spending_range = max(1, spending_max - spending_min)

        ranked_matches = sorted(
            cluster_centers,
            key=lambda center: (
                (income - center["x"]) / income_range
            ) ** 2 + (
                (spending - center["y"]) / spending_range
            ) ** 2
        )

        nearest = ranked_matches[0]
        distance = (
            (
                (income - nearest["x"]) / income_range
            ) ** 2 + (
                (spending - nearest["y"]) / spending_range
            ) ** 2
        ) ** 0.5

        similarity = max(0, round(100 / (1 + distance)))
        out_of_range = (
            income < income_min
            or income > income_max
            or spending < spending_min
            or spending > spending_max
        )
        
        recommendations = {
            "High Value": "Offer premium bundles, early access, and loyalty rewards.",
            "Premium but Cautious": "Use personalized nudges and value-focused campaigns.",
            "Growth Potential": "Promote cross-sell offers and engagement discounts.",
            "Low Value": "Run reactivation campaigns with low-friction entry offers.",
        }
        recommendation = recommendations.get(nearest.get("label"), "Review behavior and run a targeted retention strategy.")

        prediction = {
            "nearest": nearest,
            "similarity": similarity,
            "outOfRange": out_of_range,
            "recommendation": recommendation,
            "stats": {
                "incomeMin": income_min,
                "incomeMax": income_max,
                "spendingMin": spending_min,
                "spendingMax": spending_max,
            },
            "rankedMatches": ranked_matches[:3],
        }
        return jsonify(prediction)

    except Exception as e:
        # Log the exception e for debugging
        return jsonify({"error": "An unexpected error occurred during prediction."}), 500


@app.errorhandler(RequestEntityTooLarge)
def handle_large_file_error(_error):
    max_size_mb = MAX_UPLOAD_SIZE // (1024 * 1024)
    return (
        jsonify({"error": f"File is too large. Maximum allowed size is {max_size_mb} MB."}),
        413,
    )


if __name__ == "__main__":
    app.run(debug=True)
