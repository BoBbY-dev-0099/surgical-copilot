/**
 * Utility to download JSON objects as files.
 */

export function downloadJson(data, filename = 'evidence-store.json') {
    if (!data) return;

    try {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Download Error:", err);
    }
}
