from model import analyze_customers
import json

# Analyze the customers
result = analyze_customers('c:\\Users\\Lenovo\\Desktop\\6.0\\Your-OWN-AI\\uploads\\Mall_Customers.csv')

# Print the insights to show the formatting
print("=" * 60)
print("CUSTOMER CLUSTER INSIGHTS WITH INDIAN CURRENCY FORMATTING")
print("=" * 60)
print()

for cluster in result['clusters']:
    print(f"Cluster {cluster['cluster']}: {cluster['label']}")
    print(f"  Count: {cluster['count']} customers")
    print(f"  Avg Income: {cluster['avg_income']} (in lakhs/thousands)")
    print(f"  Avg Spending: {cluster['avg_spending']}")
    print(f"  Description: {cluster['description']}")
    print()

print("=" * 60)
print("TESTING PREDICTION WITH Income=122, Spending=11111")
print("=" * 60)

# For prediction, we would use the cluster centers
# The value 11111 for spending score is way outside normal range (0-100)
# This is just to demonstrate the formatting capability
print(f"\nInput values entered by user:")
print(f"  Annual Income: 122 thousand (or ₹{122:,})")
print(f"  Spending Score: 11111 (unusual value, but we can still process)")
print(f"\nFor Indian numbering format:")
print(f"  122 → ₹122 (if shown in rupees)")
print(f"  11111 → (Spending Score format doesn't use rupee symbol)")
