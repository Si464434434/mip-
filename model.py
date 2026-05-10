from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def _find_column(columns: List[str], keywords: List[str]) -> str | None:
    for column in columns:
        normalized = _normalize_text(column)
        if all(keyword in normalized for keyword in keywords):
            return column
    return None


def _format_currency(value: float) -> str:
    """Format currency in Indian numbering system (lakhs and hajar)."""
    def indian_number_format(num: float) -> str:
        num = int(num)
        if num < 0:
            return '-' + indian_number_format(-num)
        
        num_str = str(num)
        if len(num_str) <= 3:
            return num_str
        
        # Split into groups from right: units (3), thousands (2), lakhs (2), crores (2), etc.
        parts = []
        remainder = num_str
        
        # Last 3 digits (units)
        parts.append(remainder[-3:])
        remainder = remainder[:-3]
        
        # Group by 2 digits from right for lakhs, crores, etc.
        while remainder:
            if len(remainder) > 2:
                parts.append(remainder[-2:])
                remainder = remainder[:-2]
            else:
                parts.append(remainder)
                remainder = ""
        
        return ','.join(reversed(parts))
    
    return f"₹{indian_number_format(value)}"


def _assign_cluster_name(income: float, spending: float, income_median: float, spending_median: float) -> Tuple[str, str]:
    high_income = income >= income_median
    high_spending = spending >= spending_median

    if high_income and high_spending:
        return "High Value", "High income and high spending customers who are ideal for premium offers and loyalty programs."
    if high_income and not high_spending:
        return "Premium but Cautious", "High income customers who spend carefully and respond well to personalized nudges."
    if not high_income and high_spending:
        return "Growth Potential", "Lower income but high spending customers with strong engagement and cross-sell potential."
    return "Low Value", "Lower income and low spending customers who may need retention or activation campaigns."


def _elbow_method(features: np.ndarray, max_k: int = 8) -> Tuple[List[Dict[str, float]], int]:
    upper_bound = min(max_k, len(features))
    points: List[Dict[str, float]] = []

    if upper_bound < 1:
        return points, 0

    for k in range(1, upper_bound + 1):
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        model.fit(features)
        points.append({"k": k, "inertia": float(model.inertia_)})

    if len(points) <= 2:
        return points, points[-1]["k"]

    k_values = np.array([item["k"] for item in points], dtype=float)
    inertias = np.array([item["inertia"] for item in points], dtype=float)

    x1, y1 = k_values[0], inertias[0]
    x2, y2 = k_values[-1], inertias[-1]
    numerator = np.abs((y2 - y1) * k_values - (x2 - x1) * inertias + x2 * y1 - y2 * x1)
    denominator = np.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2)
    distances = numerator / denominator if denominator else np.zeros_like(k_values)
    best_index = int(np.argmax(distances))

    return points, int(k_values[best_index])


def analyze_customers(file_path: str | Path, n_clusters: int | None = None) -> Dict[str, object]:
    dataframe = pd.read_csv(file_path)
    original_columns = list(dataframe.columns)

    income_column = _find_column(original_columns, ["annual", "income"])
    spending_column = _find_column(original_columns, ["spending", "score"])

    if income_column is None or spending_column is None:
        raise ValueError("CSV must contain 'Annual Income' and 'Spending Score' columns.")

    clean_frame = dataframe[[income_column, spending_column]].copy()
    clean_frame.columns = ["Annual Income", "Spending Score"]
    clean_frame["Annual Income"] = pd.to_numeric(clean_frame["Annual Income"], errors="coerce")
    clean_frame["Spending Score"] = pd.to_numeric(clean_frame["Spending Score"], errors="coerce")
    clean_frame = clean_frame.dropna().reset_index(drop=True)

    if len(clean_frame) < 4:
        raise ValueError("The dataset must contain at least 4 valid rows after cleaning.")

    features = clean_frame[["Annual Income", "Spending Score"]].to_numpy()
    elbow_points, suggested_clusters = _elbow_method(features, max_k=8)
    max_allowed_clusters = min(8, len(clean_frame))

    if n_clusters is None:
        selected_clusters = max(2, min(int(suggested_clusters), max_allowed_clusters))
    else:
        if n_clusters < 2:
            raise ValueError("Cluster count must be at least 2.")
        if n_clusters > max_allowed_clusters:
            raise ValueError(f"Cluster count cannot exceed {max_allowed_clusters} for this dataset.")
        selected_clusters = n_clusters

    clustering_model = KMeans(n_clusters=selected_clusters, random_state=42, n_init=10)
    cluster_ids = clustering_model.fit_predict(features)
    centers = clustering_model.cluster_centers_

    income_median = float(np.median(centers[:, 0]))
    spending_median = float(np.median(centers[:, 1]))

    cluster_profiles: Dict[int, Dict[str, str]] = {}
    for cluster_id, center in enumerate(centers):
        label, description = _assign_cluster_name(
            float(center[0]),
            float(center[1]),
            income_median,
            spending_median,
        )
        cluster_profiles[int(cluster_id)] = {
            "label": label,
            "description": description,
        }

    cluster_centers = [
        {
            "cluster": int(cluster_id),
            "x": float(center[0]),
            "y": float(center[1]),
            "label": cluster_profiles[int(cluster_id)]["label"],
        }
        for cluster_id, center in enumerate(centers)
    ]

    points = []
    customer_segments = []
    for index, row in clean_frame.iterrows():
        cluster_id = int(cluster_ids[index])
        profile = cluster_profiles[cluster_id]
        customer_number = index + 1
        points.append(
            {
                "x": float(row["Annual Income"]),
                "y": float(row["Spending Score"]),
                "cluster": cluster_id,
                "label": profile["label"],
            }
        )
        customer_segments.append(
            {
                "customer": customer_number,
                "income": float(row["Annual Income"]),
                "spending": float(row["Spending Score"]),
                "cluster": cluster_id,
                "label": profile["label"],
            }
        )

    insights = []
    for cluster_id in sorted(cluster_profiles):
        members = clean_frame.loc[cluster_ids == cluster_id]
        if members.empty:
            continue

        profile = cluster_profiles[cluster_id]
        avg_income = float(members["Annual Income"].mean())
        avg_spending = float(members["Spending Score"].mean())

        insights.append(
            {
                "cluster": cluster_id,
                "label": profile["label"],
                "description": profile["description"],
                "count": int(len(members)),
                "avg_income": _format_currency(avg_income),
                "avg_spending": f"{avg_spending:.1f}",
            }
        )

    return {
        "points": points,
        "customerSegments": customer_segments,
        "clusters": insights,
        "clusterLabels": {str(cluster_id): profile["label"] for cluster_id, profile in cluster_profiles.items()},
        "clusterCenters": cluster_centers,
        "selectedClusters": selected_clusters,
        "maxClusters": max_allowed_clusters,
        "elbow": {
            "points": elbow_points,
            "suggestedClusters": suggested_clusters,
        },
    }
