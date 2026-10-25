"""Deterministic checks only: no LLM, floats, financial actions or inferred missing values."""

from decimal import Decimal, ROUND_HALF_UP

from app.invoice_schemas import InvoiceData, PurchaseOrder, ValidationCheck

CENT = Decimal("0.01")


def cents(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def check(code: str, stage: str, actual, expected, message: str) -> ValidationCheck:
    missing = actual is None or expected is None
    return ValidationCheck(
        code=code,
        stage=stage,
        status="missing" if missing else "passed" if actual == expected else "failed",
        message=message,
        actual=str(actual) if actual is not None else None,
        expected=str(expected) if expected is not None else None,
    )


def missing_fields(invoice: InvoiceData) -> list[ValidationCheck]:
    required = [
        "invoice_number",
        "supplier_name",
        "invoice_date",
        "due_date",
        "purchase_order_number",
        "currency",
        "subtotal",
        "tax_rate",
        "tax_amount",
        "total_amount",
    ]
    checks = [
        check(
            f"field.{name}",
            "extraction",
            getattr(invoice, name),
            "aanwezig",
            f"Veld {name} ontbreekt of is niet onderbouwd.",
        )
        for name in required
        if getattr(invoice, name) is None
    ]
    if not invoice.line_items:
        checks.append(
            check(
                "field.line_items",
                "extraction",
                None,
                "minstens één regel",
                "Factuurregels ontbreken.",
            )
        )
    for i, line in enumerate(invoice.line_items):
        for name in ["description", "quantity", "unit_price", "line_total"]:
            if getattr(line, name) is None:
                checks.append(
                    check(
                        f"field.line_items.{i}.{name}",
                        "extraction",
                        None,
                        "aanwezig",
                        f"Regel {i + 1}: {name} ontbreekt of is niet onderbouwd.",
                    )
                )
    return checks


def validate_totals(invoice: InvoiceData) -> list[ValidationCheck]:
    checks = []
    computed = []
    for i, line in enumerate(invoice.line_items):
        valid = line.quantity is not None and line.unit_price is not None
        checks.append(
            check(
                f"line.{i}.quantity",
                "totals",
                line.quantity > 0 if line.quantity is not None else None,
                True,
                f"Regel {i + 1}: aantal moet positief zijn.",
            )
        )
        checks.append(
            check(
                f"line.{i}.unit_price",
                "totals",
                line.unit_price >= 0 if line.unit_price is not None else None,
                True,
                f"Regel {i + 1}: prijs mag niet negatief zijn.",
            )
        )
        expected = cents(line.quantity * line.unit_price) if valid else None
        if expected is not None:
            computed.append(expected)
        checks.append(
            check(
                f"line.{i}.total",
                "totals",
                line.line_total,
                expected,
                f"Regel {i + 1}: aantal × eenheidsprijs, afgerond op centen (HALF_UP).",
            )
        )
    expected_subtotal = (
        sum(computed, Decimal("0"))
        if invoice.line_items and len(computed) == len(invoice.line_items)
        else None
    )
    checks.append(
        check(
            "subtotal",
            "totals",
            invoice.subtotal,
            expected_subtotal,
            "Subtotaal versus berekende factuurregels.",
        )
    )
    rate_valid = invoice.tax_rate is not None and Decimal("0") <= invoice.tax_rate <= Decimal("100")
    checks.append(
        check(
            "tax_rate",
            "totals",
            rate_valid if invoice.tax_rate is not None else None,
            True,
            "Vermeld btw-percentage moet tussen 0 en 100 liggen.",
        )
    )
    tax = (
        cents(invoice.subtotal * invoice.tax_rate / Decimal("100"))
        if invoice.subtotal is not None and rate_valid
        else None
    )
    checks.append(
        check(
            "tax_amount",
            "totals",
            invoice.tax_amount,
            tax,
            "Btw over het vermelde subtotaal, afgerond op centen.",
        )
    )
    total = (
        cents(invoice.subtotal + invoice.tax_amount)
        if invoice.subtotal is not None and invoice.tax_amount is not None
        else None
    )
    checks.append(
        check(
            "total_amount",
            "totals",
            invoice.total_amount,
            total,
            "Totaal = subtotaal + vermelde btw.",
        )
    )
    for name in ["subtotal", "tax_amount", "total_amount"]:
        amount = getattr(invoice, name)
        checks.append(
            check(
                f"nonnegative.{name}",
                "totals",
                amount >= 0 if amount is not None else None,
                True,
                f"{name} mag niet negatief zijn; creditnota's worden niet ondersteund.",
            )
        )
    checks.append(
        check(
            "currency_supported",
            "totals",
            invoice.currency if invoice.currency == "EUR" else None,
            "EUR",
            "Deze demo controleert bedragen in EUR met twee decimalen.",
        )
    )
    if invoice.invoice_date and invoice.due_date:
        checks.append(
            check(
                "date_order",
                "totals",
                invoice.due_date >= invoice.invoice_date,
                True,
                "Vervaldatum mag niet vóór de factuurdatum liggen.",
            )
        )
    return checks


def normalized(value: str) -> str:
    return " ".join(value.casefold().split())


def compare_order(invoice: InvoiceData, order: PurchaseOrder) -> list[ValidationCheck]:
    checks = []
    for name, actual, expected in [
        ("po_number", invoice.purchase_order_number, order.po_number),
        (
            "supplier",
            normalized(invoice.supplier_name) if invoice.supplier_name else None,
            normalized(order.supplier_name),
        ),
        ("currency", invoice.currency, order.currency),
        ("total", invoice.total_amount, order.total_amount),
        ("status", order.order_status, "approved"),
    ]:
        checks.append(
            check(f"po.{name}", "purchase_order", actual, expected, f"Inkoopordercontrole: {name}.")
        )
    seen = set()
    for i, line in enumerate(invoice.line_items):
        candidates = [
            (j, item)
            for j, item in enumerate(order.line_items)
            if (
                line.item_code
                and item.item_code
                and normalized(line.item_code) == normalized(item.item_code)
            )
            or (
                not line.item_code
                and line.description
                and item.description
                and normalized(line.description) == normalized(item.description)
            )
        ]
        if len(candidates) != 1 or candidates[0][0] in seen:
            checks.append(
                check(
                    f"po.line.{i}.match",
                    "purchase_order",
                    None if not line.description else False,
                    True,
                    f"Regel {i + 1} kan niet uniek aan een inkooporderregel worden gekoppeld.",
                )
            )
            continue
        j, expected = candidates[0]
        seen.add(j)
        for field in ["description", "quantity", "unit_price", "line_total"]:
            a, b = getattr(line, field), getattr(expected, field)
            if field == "description":
                a, b = normalized(a) if a else None, normalized(b) if b else None
            checks.append(
                check(
                    f"po.line.{i}.{field}",
                    "purchase_order",
                    a,
                    b,
                    f"Regel {i + 1}: {field} versus inkooporder.",
                )
            )
    for j in range(len(order.line_items)):
        if j not in seen:
            checks.append(
                check(
                    f"po.unmatched.{j}",
                    "purchase_order",
                    None,
                    "aanwezig",
                    "Een inkooporderregel ontbreekt op de factuur of is niet eenduidig gekoppeld.",
                )
            )
    return checks
