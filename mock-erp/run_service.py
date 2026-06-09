"""
Entrypoint that selects and runs a service based on the SERVICE_NAME environment variable.

Usage:
    SERVICE_NAME=sales_order python run_service.py
    SERVICE_NAME=warehouse python run_service.py
    SERVICE_NAME=procurement python run_service.py
    SERVICE_NAME=product_catalog python run_service.py
    SERVICE_NAME=finance python run_service.py
"""

import os
import sys
import uvicorn

SERVICE_MAP = {
    "sales_order": "services.sales_order.app:app",
    "warehouse": "services.warehouse.app:app",
    "procurement": "services.procurement.app:app",
    "product_catalog": "services.product_catalog.app:app",
    "finance": "services.finance.app:app",
}

PORT_MAP = {
    "sales_order": 9001,
    "warehouse": 9002,
    "procurement": 9003,
    "product_catalog": 9004,
    "finance": 9005,
}


def main():
    service_name = os.environ.get("SERVICE_NAME", "").strip()
    if service_name not in SERVICE_MAP:
        print(f"Error: SERVICE_NAME must be one of {list(SERVICE_MAP.keys())}")
        print(f"Got: '{service_name}'")
        sys.exit(1)

    app_path = SERVICE_MAP[service_name]
    port = int(os.environ.get("SERVICE_PORT", PORT_MAP[service_name]))

    print(f"Starting {service_name} service on port {port}...")
    uvicorn.run(app_path, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
