from decimal import ROUND_HALF_UP, Decimal

from django.db import models
from django.utils import timezone


def _round2(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# Largest values that fit the DecimalField columns below. The serializers use
# these to return a friendly 400 instead of a database "numeric overflow" (500).
MAX_AREA = Decimal("99999999.99")  # QuotationItem.area  (max_digits=10)
MAX_MONEY = Decimal("9999999999.99")  # *_total / subtotal / amount (max_digits=12)


class Customer(models.Model):
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)

    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="active",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Project(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="projects",
    )

    name = models.CharField(max_length=150)
    site_address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)

    budget = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="new",
    )

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def total_spend(self):
        return sum(
            expense.amount for expense in self.expenses.all()
        ) or Decimal("0.00")

    @property
    def total_paid(self):
        return sum(
            payment.amount for payment in self.payments.all()
        ) or Decimal("0.00")

    @property
    def outstanding_balance(self):
        """Budget still to be collected (same meaning as the project screens)."""
        return max(Decimal("0.00"), self.budget - self.total_paid)


class WorkEntry(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="work_entries",
    )

    location = models.CharField(max_length=150)
    work_type = models.CharField(max_length=150, blank=True)
    description = models.CharField(max_length=255, blank=True)

    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("1.00"),
    )

    area_size = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.amount = _round2(self.quantity * self.area_size * self.rate)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.project.name} - {self.location}"


class Expense(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="expenses",
    )

    title = models.CharField(max_length=150)
    category = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )
    notes = models.TextField(blank=True)
    # Was auto_now_add=True, which silently ignored any date sent by the app.
    date = models.DateField(default=timezone.localdate)

    def __str__(self):
        return self.title


class Payment(models.Model):
    PAYMENT_MODES = [
        ("cash", "Cash"),
        ("upi", "UPI"),
        ("bank_transfer", "Bank Transfer"),
        ("cheque", "Cheque"),
        ("other", "Other"),
    ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="payments",
    )

    title = models.CharField(
        max_length=150,
        default="Client Payment",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    mode = models.CharField(
        max_length=30,
        choices=PAYMENT_MODES,
        default="cash",
    )

    notes = models.TextField(
        blank=True
    )

    # Was auto_now_add=True, which silently ignored any date sent by the app.
    date = models.DateField(default=timezone.localdate)

    def __str__(self):
        return f"{self.project.name} - {self.title} - {self.amount}"

class Product(models.Model):
    """
    Catalogue item (window, door, ventilator, service...). Products are picked
    on quotations / invoices so the name, rate, unit and photo are reused
    instead of being re-typed every time.
    """

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, blank=True)  # SKU / model no.
    category = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)

    # Free text so you can use sqft / nos / rft / set ... without a migration.
    unit = models.CharField(max_length=30, default="sqft")
    rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    image = models.ImageField(upload_to="products/", blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


DEFAULT_QUOTATION_TERMS = (
    "1. Quotation validity: 10 days from the date of issue.\n"
    "2. Payment terms: 70% advance, 30% before dispatch / installation.\n"
    "3. Final dimensions will be confirmed at site before production.\n"
    "4. Civil, electrical, plastering and painting works are excluded "
    "unless specifically mentioned.\n"
    "5. Manufacturing / installation period: 5 working days after "
    "approval and advance payment.\n"
    "6. Pinnet glass only, other glass will be extra.\n"
    "7. Scaffolding should be provided by your side."
)


class Quotation(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("sent", "Sent"),
        ("accepted", "Accepted"),
        ("rejected", "Rejected"),
    ]

    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="quotations"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    quotation_no = models.CharField(max_length=50, unique=True)
    date = models.DateField()
    subject = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    gst_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("18.00")
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="draft"
    )
    terms = models.TextField(blank=True, default=DEFAULT_QUOTATION_TERMS)

    # Stored (not just computed on the fly) so the quotations list can be
    # sorted/filtered by value without recalculating from every item.
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.quotation_no} — {self.customer.name}"

    def recalculate_totals(self, save=True):
        subtotal = sum((item.total for item in self.items.all()), Decimal("0"))
        gst_amount = _round2(subtotal * self.gst_percent / Decimal("100"))

        self.subtotal = _round2(subtotal)
        self.gst_amount = gst_amount
        self.grand_total = self.subtotal + gst_amount

        if save:
            self.save(update_fields=["subtotal", "gst_amount", "grand_total"])


def calc_quotation_item(width, height, qty, rate):
    """Returns (area, total). Area is only used when width and height are given."""
    qty = qty if qty is not None else Decimal("0")
    if width and height:
        area = _round2(width * height * qty)
        return area, _round2(area * rate)
    return None, _round2(qty * rate)


class QuotationItem(models.Model):
    quotation = models.ForeignKey(
        Quotation, on_delete=models.CASCADE, related_name="items"
    )
    # Optional link to the catalogue. Left blank for "custom" rows.
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotation_items",
    )
    # Free-text section header, e.g. "DOUBLE OPENABLE WINDOWS". Consecutive
    # items sharing the same category are grouped when the quotation is
    # rendered/printed — there's deliberately no separate category table.
    category = models.CharField(max_length=255, blank=True)

    width = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=8, decimal_places=2, default=1)

    # Auto-derived: width * height * qty when both dimensions are given,
    # otherwise left null (flat-rate items like ventilators skip area).
    area = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def save(self, *args, **kwargs):
        self.area, self.total = calc_quotation_item(
            self.width, self.height, self.qty, self.rate
        )
        super().save(*args, **kwargs)


DEFAULT_INVOICE_TERMS = (
    "1. Payment is due on or before the due date shown above.\n"
    "2. Please pay via bank transfer, UPI, or cheque in favour of WINDAARO.\n"
    "3. Late payments may attract additional charges.\n"
    "4. This is a computer-generated invoice."
)


class Invoice(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("sent", "Sent"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]

    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="invoices"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    invoice_no = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)

    gst_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("18.00")
    )
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    terms = models.TextField(blank=True, default=DEFAULT_INVOICE_TERMS)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.invoice_no} — {self.customer.name}"

    def recalculate_totals(self, save=True):
        subtotal = sum((item.amount for item in self.items.all()), Decimal("0"))
        taxable = subtotal - self.discount
        if taxable < 0:
            taxable = Decimal("0")

        gst_amount = _round2(taxable * self.gst_percent / Decimal("100"))
        grand_total = taxable + gst_amount

        self.subtotal = _round2(subtotal)
        self.gst_amount = gst_amount
        self.grand_total = _round2(grand_total)
        self.balance_amount = _round2(self.grand_total - self.paid_amount)

        if save:
            self.save(
                update_fields=[
                    "subtotal",
                    "gst_amount",
                    "grand_total",
                    "balance_amount",
                ]
            )


def calc_invoice_item(quantity, rate):
    return _round2((quantity if quantity is not None else Decimal("0")) * rate)


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(
        Invoice, on_delete=models.CASCADE, related_name="items"
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_items",
    )
    description = models.CharField(max_length=255)
    unit = models.CharField(max_length=30, blank=True)  # e.g. "sqft", "nos"
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def save(self, *args, **kwargs):
        self.amount = calc_invoice_item(self.quantity, self.rate)
        super().save(*args, **kwargs)