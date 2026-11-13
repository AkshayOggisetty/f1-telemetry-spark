"""Convert BDA_Project_Report.md to an IEEE-style two-column Word file (black and white).

Usage:  python make_docx.py
Needs pandoc (winget install JohnMacFarlane.Pandoc) and python-docx.
"""
import copy
import os
import shutil
import subprocess

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "BDA_Project_Report.md")
OUT = os.path.join(HERE, "BDA_Project_Report.docx")
TMP = os.path.join(HERE, "_pandoc_tmp.docx")
FONT = "Times New Roman"

pandoc = shutil.which("pandoc") or os.path.expandvars(r"%LOCALAPPDATA%\Pandoc\pandoc.exe")
subprocess.run([pandoc, SRC, "-o", TMP, "--resource-path", HERE, "--syntax-highlighting=none"],
               check=True, cwd=HERE)
doc = Document(TMP)


def set_font(rpr_owner, name=FONT):
    """Force an explicit font (pandoc's reference uses theme fonts that would override it)."""
    rpr = rpr_owner.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    for a in list(fonts.attrib):
        del fonts.attrib[a]
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(a), name)


# Styles -----------------------------------------------------------------------
for st in doc.styles:
    if st.type in (1, 2) and st.element is not None:  # paragraph or character
        set_font(st.element, "Courier New" if st.name in ("Source Code", "Verbatim Char") else FONT)
        st.font.color.rgb = RGBColor(0, 0, 0)
        if st.type == 1:
            st.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE


def style(name, size, bold=None, italic=None, align=None, before=0, after=0,
          indent=None, hanging=None, small_caps=None, keep=False):
    try:
        s = doc.styles[name]
    except KeyError:
        return
    s.font.size = Pt(size)
    if bold is not None:
        s.font.bold = bold
    if italic is not None:
        s.font.italic = italic
    if small_caps is not None:
        s.font.small_caps = small_caps
    pf = s.paragraph_format
    if align is not None:
        pf.alignment = align
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    if indent is not None:
        pf.first_line_indent = Inches(indent)
    if hanging is not None:
        pf.left_indent, pf.first_line_indent = Inches(hanging), Inches(-hanging)
    if keep:
        pf.keep_with_next = True


J, C, L = WD_ALIGN_PARAGRAPH.JUSTIFY, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT
for n in ("Normal", "Body Text", "First Paragraph"):
    style(n, 10, align=J, indent=0.17)
style("Compact", 10, align=J, after=1)
style("Title", 24, bold=False, align=C, after=10)
style("Heading 1", 10, bold=False, small_caps=True, align=C, before=10, after=4, indent=0, keep=True)
style("Heading 2", 10, bold=False, italic=True, align=L, before=6, after=3, indent=0, keep=True)
style("Course Line", 10, italic=True, align=C, before=6, after=14, indent=0)
style("Abstract", 9, align=J, after=6, indent=0.17)
style("Table Caption", 8, italic=False, align=C, before=8, after=3, indent=0, keep=True)
style("Figure Caption", 8, align=J, before=2, after=8, indent=0)
style("Wide Figure", 8, align=C, before=6, after=2, indent=0)
style("Reference", 8, align=L, after=2, hanging=0.3)
style("Source Code", 7.5, align=L, before=3, after=3, indent=0)
for n in ("Title", "Heading 1", "Heading 2"):
    try:
        doc.styles[n].paragraph_format.space_before = doc.styles[n].paragraph_format.space_before
        doc.styles[n].element.get_or_add_pPr()
        for b in doc.styles[n].element.pPr.findall(qn("w:pBdr")):
            doc.styles[n].element.pPr.remove(b)
    except KeyError:
        pass
try:
    doc.styles["Verbatim Char"].font.size = Pt(8.5)
except KeyError:
    pass
try:
    doc.styles["Hyperlink"].font.underline = False
except KeyError:
    pass
# strip any shading from the code style
try:
    ppr = doc.styles["Source Code"].element.get_or_add_pPr()
    for shd in ppr.findall(qn("w:shd")):
        ppr.remove(shd)
except KeyError:
    pass

# Page layout: A4, single-column header section, then two columns -----------------
body_sect = doc.sections[-1]
body_sect.page_width, body_sect.page_height = Inches(8.27), Inches(11.69)
body_sect.top_margin, body_sect.bottom_margin = Inches(0.75), Inches(1.0)
body_sect.left_margin = body_sect.right_margin = Inches(0.625)


def set_cols(sect_pr, num):
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), str(num))
    cols.set(qn("w:space"), "360")  # 0.25 in


final_pr = doc.element.body.sectPr


def continuous(sect_pr):
    t = sect_pr.find(qn("w:type"))
    if t is None:
        t = OxmlElement("w:type")
        sect_pr.insert(0, t)
    t.set(qn("w:val"), "continuous")


def break_after(par, cols):
    """End the current section after `par` with an empty paragraph carrying `cols` columns."""
    new = OxmlElement("w:p")
    par._p.addnext(new)
    sp = copy.deepcopy(final_pr)
    set_cols(sp, cols)
    continuous(sp)
    ppr = OxmlElement("w:pPr")
    sz = OxmlElement("w:spacing"); sz.set(qn("w:before"), "0"); sz.set(qn("w:after"), "0")
    sz.set(qn("w:line"), "20"); sz.set(qn("w:lineRule"), "exact")
    ppr.append(sz)
    ppr.append(sp)
    new.append(ppr)


set_cols(final_pr, 2)
continuous(final_pr)
# single-column header (title, authors, abstract), then two columns
abstracts = [p for p in doc.paragraphs if p.style.name == "Abstract"]
break_after(abstracts[-1], 1)
# full-width screenshot block: from the first to the caption after the last "Wide Figure"
paras = doc.paragraphs
wide = [i for i, p in enumerate(paras) if p.style.name == "Wide Figure"]
if wide:
    break_after(paras[wide[0] - 1], 2)
    break_after(paras[wide[-1] + 1], 1)
    for i in range(wide[0], wide[-1] + 2):
        if paras[i].style.name == "Figure Caption":
            paras[i].alignment = C

# Paragraph fixes ------------------------------------------------------------------
for p in doc.paragraphs:
    ps = p._p.pPr.find(qn("w:pStyle")) if p._p.pPr is not None else None
    if ps is not None and ps.get(qn("w:val")) == "SourceCode":  # code listing, style not in styles.xml
        pf = p.paragraph_format
        p.alignment = L
        pf.first_line_indent, pf.left_indent = Inches(0), Inches(0.1)
        pf.space_before, pf.space_after = Pt(3), Pt(4)
        for r in p.runs:
            set_font(r._r, "Courier New")
            r.font.size = Pt(7.5)
    if p._p.findall(".//" + qn("w:drawing")):  # figure images: centred, no indent
        p.alignment = C
        p.paragraph_format.first_line_indent = Inches(0)
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.keep_with_next = True
    for r in p.runs:
        if r.font.color is not None and r.font.color.rgb not in (None, RGBColor(0, 0, 0)):
            r.font.color.rgb = RGBColor(0, 0, 0)


# Tables -------------------------------------------------------------------------
def borders(tbl, spec):
    tpr = tbl._tbl.tblPr
    for old in tpr.findall(qn("w:tblBorders")):
        tpr.remove(old)
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        sz = spec.get(edge)
        e.set(qn("w:val"), "single" if sz else "nil")
        if sz:
            e.set(qn("w:sz"), str(sz)); e.set(qn("w:color"), "000000")
        b.append(e)
    tpr.append(b)


def cell_bottom(cell, sz):
    tcpr = cell._tc.get_or_add_tcPr()
    tb = OxmlElement("w:tcBorders")
    e = OxmlElement("w:bottom")
    e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(sz)); e.set(qn("w:color"), "000000")
    tb.append(e)
    tcpr.append(tb)


for i, tbl in enumerate(doc.tables):
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tpr = tbl._tbl.tblPr
    for s in tpr.findall(qn("w:tblStyle")):
        tpr.remove(s)
    if i == 0:  # author block: borderless, full width
        borders(tbl, {})
        w = OxmlElement("w:tblW"); w.set(qn("w:w"), "5000"); w.set(qn("w:type"), "pct")
        for old in tpr.findall(qn("w:tblW")):
            tpr.remove(old)
        tpr.append(w)
        for ri, row in enumerate(tbl.rows):
            for cell in row.cells:
                tb = OxmlElement("w:tcBorders")  # override the default table style's header rule
                for edge in ("top", "left", "bottom", "right"):
                    e = OxmlElement(f"w:{edge}"); e.set(qn("w:val"), "nil"); tb.append(e)
                cell._tc.get_or_add_tcPr().append(tb)
                for p in cell.paragraphs:
                    p.alignment = C
                    p.paragraph_format.first_line_indent = Inches(0)
                    p.paragraph_format.space_after = Pt(0)
                    for r in p.runs:
                        r.font.size = Pt(11 if ri == 0 else 9)
                        r.font.bold = False
                        r.font.italic = ri >= 3
        continue
    borders(tbl, {"top": 8, "bottom": 8})
    last = len(tbl.rows) - 1
    for ri, row in enumerate(tbl.rows):
        cant = OxmlElement("w:cantSplit")
        row._tr.get_or_add_trPr().append(cant)
        for cell in row.cells:
            if ri == 0:
                cell_bottom(cell, 4)
            for p in cell.paragraphs:
                p.paragraph_format.keep_with_next = ri < last  # keep the table in one column
                p.paragraph_format.first_line_indent = Inches(0)
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(1)
                if p.alignment == J or p.alignment is None:
                    p.alignment = L
                for r in p.runs:
                    r.font.size = Pt(8)
                    if ri == 0:
                        r.font.bold = False
                        r.font.small_caps = True

doc.save(OUT)
os.remove(TMP)
print("wrote", OUT)
