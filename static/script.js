let clusterChart = null;
let elbowChart = null;
let analysisState = null;

const fileInput = document.getElementById("fileInput");
const clusterMode = document.getElementById("clusterMode");
const analyzeButton = document.getElementById("analyzeButton");
const predictIncomeInput = document.getElementById("predictIncome");
const predictSpendingInput = document.getElementById("predictSpending");
const predictClusterButton = document.getElementById("predictClusterButton");
const predictionResult = document.getElementById("predictionResult");
const loadingIndicator = document.getElementById("loadingIndicator");
const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");
const insightsList = document.getElementById("insightsList");
const insightsEmpty = document.getElementById("insightsEmpty");
const customerSegmentList = document.getElementById("customerSegmentList");
const customerSegmentsEmpty = document.getElementById("customerSegmentsEmpty");
const elbowBadge = document.getElementById("elbowBadge");
const clusterFilter = document.getElementById("clusterFilter");
const insightSearch = document.getElementById("insightSearch");
const clearInsightSearchButton = document.getElementById("clearInsightSearchButton");
const insightSearchMeta = document.getElementById("insightSearchMeta");
const exportCsvButton = document.getElementById("exportCsvButton");
const exportPdfButton = document.getElementById("exportPdfButton");

analyzeButton.addEventListener("click", analyzeCustomers);
predictClusterButton.addEventListener("click", identifyCluster);
clusterFilter.addEventListener("change", applyDashboardFilters);
insightSearch.addEventListener("input", applyDashboardFilters);
clearInsightSearchButton.addEventListener("click", clearInsightSearch);
exportCsvButton.addEventListener("click", exportCsvReport);
exportPdfButton.addEventListener("click", exportPdfReport);

function clearInsightSearch() {
    insightSearch.value = "";
    applyDashboardFilters();
    insightSearch.focus();
}

function setLoading(isLoading) {
    loadingIndicator.classList.toggle("hidden", !isLoading);
    analyzeButton.disabled = isLoading;
    analyzeButton.textContent = isLoading ? "Analyzing..." : "Analyze Customers";
}

function showMessage(element, text) {
    element.textContent = text;
    element.classList.remove("hidden");
}

function hideMessage(element) {
    element.textContent = "";
    element.classList.add("hidden");
}

function resetMessages() {
    hideMessage(errorMessage);
    hideMessage(successMessage);
}

function setExportEnabled(enabled) {
    exportCsvButton.disabled = !enabled;
    exportPdfButton.disabled = !enabled;
    predictClusterButton.disabled = !enabled;
}

function setPredictionMessage(text, kind = "info") {
    predictionResult.className = `message ${kind}`;
    predictionResult.textContent = text;
    predictionResult.classList.remove("hidden");
}

function hidePredictionMessage() {
    predictionResult.textContent = "";
    predictionResult.className = "message info hidden";
}

function populateClusterFilter(payload) {
    clusterFilter.innerHTML = '<option value="all" selected>All clusters</option>';
    const labels = payload?.clusterLabels || {};

    Object.entries(labels).forEach(([clusterId, label]) => {
        const option = document.createElement("option");
        option.value = clusterId;
        option.textContent = label;
        clusterFilter.appendChild(option);
    });
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function parseNumericInput(input) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
}

function buildPredictionStats() {
    const points = analysisState?.points || [];
    if (!points.length) {
        return null;
    }

    const incomes = points.map((point) => point.x);
    const spendings = points.map((point) => point.y);

    const incomeMin = Math.min(...incomes);
    const incomeMax = Math.max(...incomes);
    const spendingMin = Math.min(...spendings);
    const spendingMax = Math.max(...spendings);

    return {
        incomeMin,
        incomeMax,
        spendingMin,
        spendingMax,
        incomeRange: Math.max(1, incomeMax - incomeMin),
        spendingRange: Math.max(1, spendingMax - spendingMin),
    };
}

function getSegmentRecommendation(label) {
    const recommendations = {
        "High Value": "Offer premium bundles, early access, and loyalty rewards.",
        "Premium but Cautious": "Use personalized nudges and value-focused campaigns.",
        "Growth Potential": "Promote cross-sell offers and engagement discounts.",
        "Low Value": "Run reactivation campaigns with low-friction entry offers.",
    };

    return recommendations[label] || "Review behavior and run a targeted retention strategy.";
}

function identifyClusterFromValues(income, spending) {
    if (!analysisState?.clusterCenters?.length) {
        return null;
    }

    const stats = buildPredictionStats();
    if (!stats) {
        return null;
    }

    const rankedMatches = analysisState.clusterCenters
        .map((center) => {
            const normalizedIncomeDistance = (income - center.x) / stats.incomeRange;
            const normalizedSpendingDistance = (spending - center.y) / stats.spendingRange;
            const distance = Math.hypot(normalizedIncomeDistance, normalizedSpendingDistance);

            return {
                ...center,
                distance,
            };
        })
        .sort((left, right) => left.distance - right.distance);

    const nearest = rankedMatches[0];
    const similarity = Math.max(0, Math.round(100 / (1 + nearest.distance)));
    const outOfRange =
        income < stats.incomeMin ||
        income > stats.incomeMax ||
        spending < stats.spendingMin ||
        spending > stats.spendingMax;

    return {
        nearest,
        rankedMatches: rankedMatches.slice(0, 3),
        similarity,
        outOfRange,
        stats,
    };
}

function identifyCluster() {
    resetMessages();
    hidePredictionMessage();

    if (!analysisState) {
        showMessage(errorMessage, "Run analysis first before identifying a cluster.");
        return;
    }

    const income = parseNumericInput(predictIncomeInput);
    const spending = parseNumericInput(predictSpendingInput);

    if (income === null || spending === null) {
        showMessage(errorMessage, "Enter valid Annual Income and Spending Score values.");
        return;
    }

    if (income < 0 || spending < 0) {
        showMessage(errorMessage, "Income and Spending Score cannot be negative.");
        return;
    }

    const predicted = identifyClusterFromValues(income, spending);
    if (!predicted) {
        showMessage(errorMessage, "Cluster data is not ready yet. Run analysis again.");
        return;
    }

    const nearest = predicted.nearest;
    const recommendation = getSegmentRecommendation(nearest.label);
    const rangeNote = predicted.outOfRange
        ? `Input is outside dataset range (Income ${predicted.stats.incomeMin.toFixed(1)}-${predicted.stats.incomeMax.toFixed(1)}, Spending ${predicted.stats.spendingMin.toFixed(1)}-${predicted.stats.spendingMax.toFixed(1)}).`
        : "Input is within the dataset range.";
    const topMatches = predicted.rankedMatches
        .map((match, index) => `${index + 1}) Cluster ${match.cluster + 1} ${match.label}`)
        .join(" | ");

    setPredictionMessage(
        `Nearest segment: Cluster ${nearest.cluster + 1} (${nearest.label})\nSimilarity score: ${predicted.similarity}%\n${rangeNote}\nRecommendation: ${recommendation}\nTop matches: ${topMatches}`,
        "success",
    );
}

function getFilteredView() {
    if (!analysisState) {
        return { points: [], clusters: [], customerSegments: [] };
    }

    const selectedCluster = clusterFilter.value || "all";
    const searchQuery = normalizeText(insightSearch.value);
    const allPoints = analysisState.points || [];
    const allClusters = analysisState.clusters || [];
    const allCustomerSegments = analysisState.customerSegments || [];

    const clusterById = new Map(allClusters.map((cluster) => [String(cluster.cluster), cluster]));

    const filteredClusters = allClusters.filter((cluster) => {
        const clusterMatch = selectedCluster === "all" || String(cluster.cluster) === selectedCluster;
        if (!clusterMatch) {
            return false;
        }

        if (!searchQuery) {
            return true;
        }

        return normalizeText(cluster.label).includes(searchQuery) || normalizeText(cluster.description).includes(searchQuery);
    });

    const allowedClusterIds = new Set(filteredClusters.map((cluster) => String(cluster.cluster)));

    const filteredPoints = allPoints.filter((point) => {
        const pointClusterId = String(point.cluster);
        if (!allowedClusterIds.has(pointClusterId)) {
            return false;
        }

        if (!searchQuery) {
            return true;
        }

        const pointCluster = clusterById.get(pointClusterId);
        if (!pointCluster) {
            return false;
        }
        return normalizeText(pointCluster.label).includes(searchQuery) || normalizeText(pointCluster.description).includes(searchQuery);
    });

    const filteredCustomerSegments = allCustomerSegments.filter((customer) => {
        const customerClusterId = String(customer.cluster);
        if (!allowedClusterIds.has(customerClusterId)) {
            return false;
        }

        if (!searchQuery) {
            return true;
        }

        const searchableText = [
            customer.label,
            `cluster ${Number(customer.cluster) + 1}`,
            `customer ${customer.customer}`,
            String(customer.income),
            String(customer.spending),
        ]
            .join(" ")
            .toLowerCase();

        return searchableText.includes(searchQuery);
    });

    return {
        points: filteredPoints,
        clusters: filteredClusters,
        customerSegments: filteredCustomerSegments,
        searchQuery,
    };
}

function updateInsightSearchMeta(filtered) {
    if (!analysisState) {
        insightSearchMeta.textContent = "Use search to filter insights and customer rows.";
        clearInsightSearchButton.disabled = true;
        return;
    };

    const totalClusters = (analysisState.clusters || []).length;
    const totalCustomers = (analysisState.customerSegments || []).length;
    const visibleClusters = (filtered.clusters || []).length;
    const visibleCustomers = (filtered.customerSegments || []).length;
    const query = filtered.searchQuery || "";

    clearInsightSearchButton.disabled = query.length === 0;

    if (!query) {
        insightSearchMeta.textContent = `Showing ${visibleClusters}/${totalClusters} insights and ${visibleCustomers}/${totalCustomers} customers.`;
        return;
    }

    insightSearchMeta.textContent = `Search "${query}" matched ${visibleClusters} insights and ${visibleCustomers} customers.`;
}

function applyDashboardFilters() {
    if (!analysisState) {
        updateInsightSearchMeta({ clusters: [], customerSegments: [], searchQuery: "" });
        return;
    }

    const filtered = getFilteredView();
    renderChart(filtered.points, analysisState.clusterLabels || {});
    renderInsights(filtered.clusters || []);
    renderCustomerSegments(filtered.customerSegments || []);
    updateInsightSearchMeta(filtered);
}

function escapeCsv(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\n") || text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function downloadBlob(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function reportFileStamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}_${hour}${minute}`;
}

function exportCsvReport() {
    if (!analysisState) {
        showMessage(errorMessage, "Run analysis first to export a report.");
        return;
    }

    const filtered = getFilteredView();
    const lines = [];

    lines.push("Report Type,Customer Segmentation");
    lines.push(`Generated At,${escapeCsv(new Date().toLocaleString())}`);
    lines.push(`Selected Clusters,${analysisState.selectedClusters}`);
    lines.push(`Elbow Suggested Clusters,${analysisState.elbow?.suggestedClusters ?? "N/A"}`);
    lines.push(`Visible Clusters,${filtered.clusters.length}`);
    lines.push(`Visible Customers,${filtered.points.length}`);
    lines.push("");

    lines.push("Cluster ID,Label,Description,Customers,Avg Income,Avg Spending");
    filtered.clusters.forEach((cluster) => {
        lines.push([
            cluster.cluster,
            escapeCsv(cluster.label),
            escapeCsv(cluster.description),
            cluster.count,
            escapeCsv(cluster.avg_income),
            escapeCsv(cluster.avg_spending),
        ].join(","));
    });

    lines.push("");
    lines.push("Annual Income,Spending Score,Cluster ID,Cluster Label");
    filtered.points.forEach((point) => {
        lines.push([
            point.x,
            point.y,
            point.cluster,
            escapeCsv(point.label),
        ].join(","));
    });

    downloadBlob(lines.join("\n"), `segmentation_report_${reportFileStamp()}.csv`, "text/csv;charset=utf-8");
}

function exportPdfReport() {
    if (!analysisState) {
        showMessage(errorMessage, "Run analysis first to export a report.");
        return;
    }

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        showMessage(errorMessage, "PDF library not loaded. Please refresh and try again.");
        return;
    }

    const filtered = getFilteredView();
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Customer Segmentation Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
    doc.text(`Selected Clusters: ${analysisState.selectedClusters}`, 14, 32);
    doc.text(`Elbow Suggested Clusters: ${analysisState.elbow?.suggestedClusters ?? "N/A"}`, 14, 38);
    doc.text(`Visible Clusters: ${filtered.clusters.length}`, 14, 44);
    doc.text(`Visible Customers: ${filtered.points.length}`, 14, 50);

    const clusterRows = filtered.clusters.map((cluster) => [
        String(cluster.cluster),
        cluster.label,
        String(cluster.count),
        cluster.avg_income,
        String(cluster.avg_spending),
    ]);

    if (typeof doc.autoTable === "function") {
        doc.autoTable({
            head: [["Cluster", "Label", "Customers", "Avg Income", "Avg Spending"]],
            body: clusterRows,
            startY: 58,
            styles: { fontSize: 9 },
        });

        const pointsRows = filtered.points.slice(0, 300).map((point) => [
            String(point.x),
            String(point.y),
            String(point.cluster),
            point.label,
        ]);

        doc.autoTable({
            head: [["Income", "Spending", "Cluster", "Label"]],
            body: pointsRows,
            startY: doc.lastAutoTable.finalY + 8,
            styles: { fontSize: 8 },
        });
    } else {
        doc.text("Cluster Summary", 14, 58);
        let y = 64;
        clusterRows.forEach((row) => {
            doc.text(`${row[1]} | Customers: ${row[2]} | Avg Income: ${row[3]} | Avg Spending: ${row[4]}`, 14, y);
            y += 6;
        });
    }

    doc.save(`segmentation_report_${reportFileStamp()}.pdf`);
}

function createClusterDatasets(points, labels) {
    const palette = [
        { border: "#67e8f9", background: "rgba(103, 232, 249, 0.36)" },
        { border: "#a78bfa", background: "rgba(167, 139, 250, 0.36)" },
        { border: "#f59e0b", background: "rgba(245, 158, 11, 0.36)" },
        { border: "#34d399", background: "rgba(52, 211, 153, 0.36)" },
    ];

    const clusters = new Map();

    points.forEach((point) => {
        if (!clusters.has(point.cluster)) {
            clusters.set(point.cluster, []);
        }
        clusters.get(point.cluster).push({ x: point.x, y: point.y });
    });

    return Array.from(clusters.entries()).map(([clusterId, data]) => {
        const color = palette[clusterId % palette.length];
        const label = labels?.[clusterId] || `Cluster ${Number(clusterId) + 1}`;

        return {
            label,
            data,
            pointRadius: 6,
            pointHoverRadius: 8,
            borderColor: color.border,
            backgroundColor: color.background,
        };
    });
}

function renderChart(points, labels) {
    const ctx = document.getElementById("clusterChart").getContext("2d");
    const datasets = createClusterDatasets(points, labels);

    if (clusterChart) {
        clusterChart.destroy();
    }

    clusterChart = new Chart(ctx, {
        type: "scatter",
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: "#dbeafe",
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: Income ${context.parsed.x}, Spending ${context.parsed.y}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Annual Income",
                        color: "#cbd5e1",
                    },
                    ticks: {
                        color: "#94a3b8",
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)",
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: "Spending Score",
                        color: "#cbd5e1",
                    },
                    ticks: {
                        color: "#94a3b8",
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)",
                    },
                },
            },
        },
    });
}

function renderElbowChart(elbow, selectedClusters) {
    const ctx = document.getElementById("elbowChart").getContext("2d");
    const points = elbow?.points || [];

    if (elbowChart) {
        elbowChart.destroy();
    }

    if (!points.length) {
        elbowChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: "Elbow chart will appear after analysis",
                        color: "#cbd5e1",
                    },
                },
            },
        });
        return;
    }

    const labels = points.map((point) => point.k);
    const inertias = points.map((point) => point.inertia);

    elbowChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Inertia",
                    data: inertias,
                    borderColor: "#6ee7ff",
                    backgroundColor: "rgba(110, 231, 255, 0.2)",
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                    tension: 0.24,
                    fill: true,
                },
                {
                    label: "Selected clusters",
                    data: labels.map((k) => (k === selectedClusters ? inertias[labels.indexOf(k)] : null)),
                    borderColor: "#f59e0b",
                    backgroundColor: "#f59e0b",
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false,
                },
                {
                    label: "Suggested clusters",
                    data: labels.map((k) => (k === elbow?.suggestedClusters ? inertias[labels.indexOf(k)] : null)),
                    borderColor: "#34d399",
                    backgroundColor: "#34d399",
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: "#dbeafe",
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                title: {
                    display: true,
                    text: "Elbow Method (k vs inertia)",
                    color: "#cbd5e1",
                },
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Number of clusters (k)",
                        color: "#cbd5e1",
                    },
                    ticks: {
                        color: "#94a3b8",
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)",
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: "Inertia",
                        color: "#cbd5e1",
                    },
                    ticks: {
                        color: "#94a3b8",
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)",
                    },
                },
            },
        },
    });
}

function renderInsights(clusters) {
    if (!clusters || clusters.length === 0) {
        insightsEmpty.classList.remove("hidden");
        insightsList.innerHTML = "";
        return;
    }

    insightsEmpty.classList.add("hidden");
    insightsList.innerHTML = clusters
        .map(
            (cluster) => `
                <div class="insight-item">
                    <h3>${cluster.label}</h3>
                    <p>${cluster.description}</p>
                    <div class="meta-row">
                        <span class="meta-chip">Customers: ${cluster.count}</span>
                        <span class="meta-chip">Avg Income: ${cluster.avg_income}</span>
                        <span class="meta-chip">Avg Spending: ${cluster.avg_spending}</span>
                    </div>
                </div>
            `,
        )
        .join("");
}

function renderCustomerSegments(customerSegments) {
    if (!customerSegments || customerSegments.length === 0) {
        customerSegmentsEmpty.classList.remove("hidden");
        customerSegmentList.innerHTML = "";
        return;
    }

    customerSegmentsEmpty.classList.add("hidden");
    customerSegmentList.innerHTML = customerSegments
        .map(
            (customer) => `
                <div class="customer-row">
                    <div class="customer-row-main">
                        <strong>Customer ${customer.customer}</strong>
                        <span>Income: ${customer.income.toFixed(1)} | Spending: ${customer.spending.toFixed(1)}</span>
                    </div>
                    <span class="meta-chip customer-chip">Cluster ${customer.cluster + 1}: ${customer.label}</span>
                </div>
            `,
        )
        .join("");
}

function updateElbowBadge(elbow, selectedClusters, mode) {
    if (!elbow || !elbow.suggestedClusters || !selectedClusters) {
        elbowBadge.textContent = "Elbow method: waiting for data";
        return;
    }

    if (mode === "auto") {
        elbowBadge.textContent = `Elbow suggests ${elbow.suggestedClusters}. Auto-selected ${selectedClusters}.`;
        return;
    }

    elbowBadge.textContent = `Elbow suggests ${elbow.suggestedClusters}. You selected ${selectedClusters}.`;
}

async function analyzeCustomers() {
    resetMessages();

    const file = fileInput.files[0];
    if (!file) {
        showMessage(errorMessage, "Please upload a CSV file before analyzing.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("clusters", clusterMode.value || "auto");

    try {
        setLoading(true);
        const response = await fetch("/analyze", {
            method: "POST",
            body: formData,
        });

        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        let payload;

        if (isJson) {
            const responseClone = response.clone();
            try {
                payload = await response.json();
            } catch {
                payload = await responseClone.text();
            }
        } else {
            payload = await response.text();
        }

        if (!response.ok) {
            if (isJson && payload && typeof payload === "object") {
                throw new Error(payload.error || "Unable to analyze customers.");
            }

            const text = typeof payload === "string" ? payload : "";
            const shortMessage = text.replace(/\s+/g, " ").trim().slice(0, 180);
            throw new Error(shortMessage || "Unable to analyze customers.");
        }

        if (!isJson || !payload || typeof payload !== "object") {
            throw new Error("Server returned an unexpected response format.");
        }

        analysisState = payload;
        populateClusterFilter(payload);
        setExportEnabled(true);

        renderChart(payload.points || [], payload.clusterLabels || {});
        renderElbowChart(payload.elbow || {}, payload.selectedClusters);
        renderInsights(payload.clusters || []);
        renderCustomerSegments(payload.customerSegments || []);
        updateElbowBadge(payload.elbow || {}, payload.selectedClusters, clusterMode.value || "auto");
        hidePredictionMessage();
        applyDashboardFilters();
        showMessage(successMessage, `Analysis completed successfully. ${payload.points.length} customers clustered into ${payload.selectedClusters} segments.`);
    } catch (error) {
        showMessage(errorMessage, error.message || "A processing error occurred.");
    } finally {
        setLoading(false);
    }
}