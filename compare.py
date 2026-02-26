import os

dir1 = r'C:\Users\aayus\Downloads\27\surgical-copilot'
dir2 = r'd:\github\surgical-copilot'

def get_all_files(dir_path):
    files = set()
    for root, _, filenames in os.walk(dir_path):
        if '.git' in root or 'node_modules' in root or 'venv' in root or '__pycache__' in root or '.gemini' in root:
            continue
        for f in filenames:
            if f.endswith('.zip') or f.endswith('.pyc'): continue
            rel_dir = os.path.relpath(root, dir_path)
            rel_file = os.path.normpath(os.path.join(rel_dir, f)) if rel_dir != '.' else f
            files.add(rel_file)
    return files

f1 = get_all_files(dir1)
f2 = get_all_files(dir2)

missing_in_git = f1 - f2
print('Files in original but missing in Git repo:', len(missing_in_git))
for f in sorted(list(missing_in_git)):
    print('  -', f)

missing_in_orig = f2 - f1
print('Files in Git repo but missing in original:', len(missing_in_orig))
for f in sorted(list(missing_in_orig)):
    print('  -', f)
