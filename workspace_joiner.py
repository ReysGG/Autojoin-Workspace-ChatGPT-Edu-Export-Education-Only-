import requests
import json
import argparse
import time
import re

def join_workspace(access_token, workspace_id):
    # Endpoint URL untuk request invite ke workspace yang ditentukan
    url = f"https://chatgpt.com/backend-api/accounts/{workspace_id}/invites/request"
    
    # Header yang diperlukan agar request disetujui oleh ChatGPT API
    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "authorization": f"Bearer {access_token}",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "oai-language": "en-US",
        "pragma": "no-cache",
        "sec-ch-ua-arch": '"x86"',
        "sec-ch-ua-bitness": '"64"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-model": '""',
        "sec-ch-ua-platform": '"macOS"',
        "sec-ch-ua-platform-version": '"13.5.1"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    # Data payload kosong sesuai request asli
    payload = {}

    print(f"Mengirim permintaan join ke workspace: {workspace_id}...")
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"HTTP Status Code: {response.status_code}")
        
        # Coba parse response sebagai JSON
        try:
            response_data = response.json()
        except ValueError:
            response_data = response.text
            
        if response.status_code == 200:
            print("✓ Permintaan Join Workspace Berhasil!")
            print(json.dumps(response_data, indent=2))
            return True
        else:
            print("✗ Permintaan Gagal!")
            print(f"Respons Error: {response_data}")
            return False
            
    except Exception as e:
        print(f"Terjadi kesalahan saat melakukan request: {e}")
        return False

def extract_uuids(text):
    # Regex untuk mencocokkan UUID v4
    return re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', text, re.IGNORECASE)

if __name__ == "__main__":
    # parser argumen untuk fleksibilitas pemanggilan via CLI
    parser = argparse.ArgumentParser(description="Script Python untuk join workspace ChatGPT.")
    parser.add_argument("--token", help="Bearer access_token dari session ChatGPT Anda.")
    parser.add_argument("--workspace", help="ID Workspace target (bisa dipisahkan dengan koma untuk beberapa ID).")
    parser.add_argument("--file", help="Path ke file teks/markdown yang berisi daftar ID Workspace.")
    
    args = parser.parse_args()
    
    # Jika token tidak diisi via CLI, minta input
    token = args.token or input("Masukkan Access Token ChatGPT Anda: ").strip()
    
    workspaces = []
    
    if args.workspace:
        # Split berdasarkan koma
        workspaces = [w.strip() for w in args.workspace.split(",") if w.strip()]
    elif args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
                workspaces = extract_uuids(content)
        except Exception as e:
            print(f"Gagal membaca file: {e}")
    else:
        # Input interaktif
        workspace_input = input("Masukkan ID Workspace (pisahkan dengan koma jika lebih dari satu, atau kosongkan untuk mencari file): ").strip()
        if workspace_input:
            workspaces = [w.strip() for w in workspace_input.split(",") if w.strip()]
        else:
            # Jika dikosongkan, coba cari secara default di workspace.md
            import os
            default_file = "../workspace.md"
            if os.path.exists(default_file):
                print(f"Membaca daftar ID Workspace dari file default: {default_file}...")
                try:
                    with open(default_file, "r", encoding="utf-8") as f:
                        content = f.read()
                        workspaces = extract_uuids(content)
                        # Filter agar unik mempertahankan urutan
                        seen = set()
                        workspaces = [x for x in workspaces if not (x in seen or seen.add(x))]
                except Exception as e:
                    print(f"Gagal membaca workspace.md: {e}")
            
    if not token:
        print("Error: Access Token wajib diisi!")
    elif not workspaces:
        print("Error: Tidak ada ID Workspace yang ditemukan untuk dituju!")
    else:
        print(f"Menemukan total {len(workspaces)} workspace untuk diproses.")
        success_count = 0
        for i, ws in enumerate(workspaces):
            print(f"\n[{i+1}/{len(workspaces)}]")
            if join_workspace(token, ws):
                success_count += 1
            # Berikan sedikit jeda waktu antar request agar aman
            if i < len(workspaces) - 1:
                time.sleep(1)
        print(f"\nSelesai! Berhasil mengajukan join ke {success_count} dari {len(workspaces)} workspace.")
