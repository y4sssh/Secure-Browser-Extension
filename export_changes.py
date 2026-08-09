#!/usr/bin/env python3
import argparse
import datetime
import os
import subprocess
import sys
import textwrap

PDF_PAGE_WIDTH = 612
PDF_PAGE_HEIGHT = 792
PDF_MARGIN = 50
PDF_LINE_HEIGHT = 14
PDF_FONT_SIZE = 10
PDF_MAX_LINE_LENGTH = 95
PDF_LINES_PER_PAGE = int((PDF_PAGE_HEIGHT - 2 * PDF_MARGIN) / PDF_LINE_HEIGHT)


def run_git(args, cwd=None):
    result = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Git command failed: git {' '.join(args)}\n{result.stderr.strip()}"
        )
    return result.stdout.strip()


def collect_status(root):
    return run_git(["status", "--short"], cwd=root)


def collect_diff_stat(root):
    return run_git(["diff", "--stat", "--name-status"], cwd=root)


def collect_diff_names(root):
    return run_git(["diff", "--name-only"], cwd=root)


def collect_diff_patch(root):
    return run_git(["diff"], cwd=root)


def collect_commit_log(root, max_commits, since):
    args = [
        "log",
        "--all",
        "--graph",
        "--date=short",
        "--pretty=format:%h %ad %s",
        f"--max-count={max_commits}",
    ]
    if since:
        args.append(f"--since={since}")
    return run_git(args, cwd=root)


def pdf_escape(text):
    text = text.replace("\\", "\\\\")
    text = text.replace("(", "\\(")
    text = text.replace(")", "\\)")
    return text


def normalize_text(text):
    text = text.replace("\t", "    ")
    return text


def split_text_lines(text):
    lines = []
    for raw in text.splitlines():
        raw = normalize_text(raw)
        if raw.strip() == "":
            lines.append("")
            continue
        wrapped = textwrap.wrap(raw, width=PDF_MAX_LINE_LENGTH, replace_whitespace=False)
        lines.extend(wrapped or [""])
    return lines


def build_pdf(text, output_path, title=None):
    lines = split_text_lines(text)
    pages = [lines[i:i + PDF_LINES_PER_PAGE] for i in range(0, len(lines), PDF_LINES_PER_PAGE)]
    objs = []
    offsets = []

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body = bytearray(header)

    # Catalog, pages, and font objects
    catalog_id = 1
    pages_id = 2
    font_id = 5
    content_start_id = 6

    catalog_obj = f"{catalog_id} 0 obj\n<< /Type /Catalog /Pages {pages_id} 0 R >>\nendobj\n"
    offsets.append(len(body))
    body.extend(catalog_obj.encode("utf-8"))

    page_ids = []
    content_ids = []
    for p_index, page_lines in enumerate(pages, start=1):
        content_id = content_start_id + (p_index - 1) * 2
        page_id = content_id + 1
        content_ids.append(content_id)
        page_ids.append(page_id)

    pages_kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    pages_obj = f"{pages_id} 0 obj\n<< /Type /Pages /Kids [{pages_kids}] /Count {len(page_ids)} >>\nendobj\n"
    offsets.append(len(body))
    body.extend(pages_obj.encode("utf-8"))

    font_obj = f"{font_id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    offsets.append(len(body))
    body.extend(font_obj.encode("utf-8"))

    for page_index, page_lines in enumerate(pages, start=1):
        content_id = content_start_id + (page_index - 1) * 2
        page_id = content_id + 1
        escaped_lines = []
        if title and page_index == 1:
            escaped_lines.append(pdf_escape(title))
            escaped_lines.append("")
        for line in page_lines:
            escaped_lines.append(pdf_escape(line))
        stream_lines = [f"BT /F1 {PDF_FONT_SIZE} Tf {PDF_MARGIN} {PDF_PAGE_HEIGHT - PDF_MARGIN - PDF_FONT_SIZE} Td"]
        for line in escaped_lines:
            stream_lines.append(f"({line}) Tj")
            stream_lines.append("T*")
        stream_lines.append("ET")
        stream_data = "\n".join(stream_lines) + "\n"
        stream_bytes = stream_data.encode("utf-8")

        content_obj = (
            f"{content_id} 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n"
            + stream_data
            + "endstream\nendobj\n"
        )
        offsets.append(len(body))
        body.extend(content_obj.encode("utf-8"))

        page_obj = (
            f"{page_id} 0 obj\n<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PDF_PAGE_WIDTH} {PDF_PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>\nendobj\n"
        )
        offsets.append(len(body))
        body.extend(page_obj.encode("utf-8"))

    xref_offset = len(body)
    xref_lines = ["xref", f"0 {len(offsets) + 1}", "0000000000 65535 f "]
    for offset in offsets:
        xref_lines.append(f"{offset:010d} 00000 n ")
    xref_text = "\n".join(xref_lines) + "\n"
    body.extend(xref_text.encode("utf-8"))

    trailer = (
        "trailer\n<< /Size {size} /Root {root} 0 R >>\nstartxref\n{start}\n%%EOF\n"
        .format(size=len(offsets) + 1, root=catalog_id, start=xref_offset)
    )
    body.extend(trailer.encode("utf-8"))

    with open(output_path, "wb") as out:
        out.write(body)


def ensure_git_repo():
    try:
        root = run_git(["rev-parse", "--show-toplevel"])
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    return root


def build_report(root, mode, max_commits, since, full_diff):
    title = "Repository Change Diary"
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sections = [f"{title}", "", f"Repository: {root}", f"Generated: {now}", ""]

    status = collect_status(root)
    sections.append("Git status:")
    sections.append(status or "No uncommitted changes.")
    sections.append("")

    if mode in ("diff", "both"):
        sections.append("Working tree changes:")
        diff_names = collect_diff_names(root)
        sections.append(diff_names or "No changed files.")
        sections.append("")
        sections.append("Diff summary:")
        sections.append(collect_diff_stat(root) or "No diff summary.")
        sections.append("")
        if full_diff:
            sections.append("Full patch:")
            sections.append(collect_diff_patch(root) or "No patch available.")
            sections.append("")

    if mode in ("log", "both"):
        sections.append("Commit history:")
        sections.append(collect_commit_log(root, max_commits, since) or "No commits found.")
        sections.append("")

    return "\n".join(sections), title


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export git changes and history to a PDF diary."
    )
    parser.add_argument(
        "--output",
        default="change_diary.pdf",
        help="Output PDF file path (default: change_diary.pdf)",
    )
    parser.add_argument(
        "--mode",
        choices=["diff", "log", "both"],
        default="both",
        help="Choose which content to export: working tree diff, commit log, or both.",
    )
    parser.add_argument(
        "--since",
        help="Limit git log to commits since this date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--max-commits",
        type=int,
        default=100,
        help="Maximum number of commits to include in the log.",
    )
    parser.add_argument(
        "--full-diff",
        action="store_true",
        help="Include the full git diff patch in the PDF.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    root = ensure_git_repo()
    report_text, title = build_report(
        root,
        args.mode,
        args.max_commits,
        args.since,
        args.full_diff,
    )
    output_path = os.path.abspath(args.output)
    build_pdf(report_text, output_path, title=title)
    print(f"Saved change diary PDF to: {output_path}")


if __name__ == "__main__":
    main()
