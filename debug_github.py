
import asyncio
import os
from pathlib import Path

import httpx2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


async def main():
    token = os.getenv("GITHUB_TOKEN", "").strip()

    if not token:
        print("ERROR: GITHUB_TOKEN is missing.")
        return

    print("Token found in environment.")

    async with httpx2.AsyncClient(
        timeout=20.0
    ) as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

        print("GitHub HTTP status:", response.status_code)

        if response.status_code == 200:
            data = response.json()
            print("Authenticated GitHub user:", data["login"])
            print("Authentication successful!")
        elif response.status_code == 401:
            print("Token is invalid or expired.")
        elif response.status_code == 403:
            print("GitHub denied this request.")
        else:
            print("Unexpected authentication response.")


if __name__ == "__main__":
    asyncio.run(main())
