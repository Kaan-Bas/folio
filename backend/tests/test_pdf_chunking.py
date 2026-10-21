import pytest

from app.chunking import chunk_pages
from app.config import Settings
from app.errors import AppError
from app.pdf import PageText, extract_pdf
from conftest import make_pdf


def test_pdf_preserves_physical_pages_and_skips_empty_text():
    result = extract_pdf(make_pdf("Eerste pagina", "", "Derde pagina"))
    assert result.total_pages == 3
    assert [(page.page, page.text) for page in result.pages] == [
        (1, "Eerste pagina"),
        (3, "Derde pagina"),
    ]


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"not a pdf", "invalid_pdf"),
        (b"%PDF-1.7\ninvalid", "unreadable_pdf"),
        (make_pdf(""), "empty_pdf"),
        (make_pdf("Secret", password="secret"), "encrypted_pdf"),
    ],
)
def test_unreadable_empty_or_encrypted_pdf(data, code):
    with pytest.raises(AppError) as error:
        extract_pdf(data)
    assert error.value.code == code


@pytest.mark.parametrize("limits", [{"max_pages": 1}, {"max_chars": 3}])
def test_pdf_resource_limits(limits):
    with pytest.raises(AppError) as error:
        extract_pdf(make_pdf("Page one", "Page two"), **limits)
    assert error.value.status_code == 413


def test_overlapping_windows_preserve_text_and_metadata():
    chunks = chunk_pages([PageText(3, "abcdefghijklmnop")], chunk_size=8, overlap=3)
    assert [chunk.text for chunk in chunks] == ["abcdefgh", "fghijklm", "klmnop"]
    assert [chunk.page for chunk in chunks] == [3, 3, 3]
    assert [chunk.id for chunk in chunks] == ["p3-c0", "p3-c1", "p3-c2"]
    assert chunks[0].text[-3:] == chunks[1].text[:3]


def test_chunks_do_not_cross_pages_or_duplicate_final_window():
    chunks = chunk_pages([PageText(1, "abcdefgh"), PageText(5, "ijk")], chunk_size=8, overlap=2)
    assert [(chunk.page, chunk.text) for chunk in chunks] == [(1, "abcdefgh"), (5, "ijk")]
    assert chunk_pages([PageText(1, "   ")]) == []


@pytest.mark.parametrize(("size", "overlap"), [(0, 0), (3, 3), (3, 4), (3, -1)])
def test_invalid_chunk_configuration(size, overlap):
    with pytest.raises(ValueError):
        chunk_pages([PageText(1, "abc")], chunk_size=size, overlap=overlap)


def test_settings_reject_overlap_larger_than_chunk():
    with pytest.raises(ValueError, match="CHUNK_OVERLAP"):
        Settings(_env_file=None, chunk_size=100, chunk_overlap=100)
