from django.contrib import admin
from django.utils.html import format_html

from .models import (
    Customer,
    Project,
    WorkEntry,
    Expense,
    Payment,
    Product,
    Quotation,
    QuotationItem,
    Invoice,
    InvoiceItem,
)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "phone",
        "email",
        "city",
        "state",
        "created_at",
    )


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "customer",
        "city",
        "state",
        "status",
        "created_at",
    )


@admin.register(WorkEntry)
class WorkEntryAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "location",
        "work_type",
        "quantity",
        "area_size",
        "rate",
        "amount",
        "created_at",
    )


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "title",
        "category",
        "amount",
        "date",
    )


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "title",
        "amount",
        "mode",
        "date",
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "thumbnail",
        "name",
        "code",
        "category",
        "unit",
        "rate",
        "is_active",
    )
    list_filter = ("is_active", "category")
    search_fields = ("name", "code", "category")
    list_editable = ("is_active",)

    @admin.display(description="Image")
    def thumbnail(self, obj):
        if not obj.image:
            return "-"
        return format_html(
            '<img src="{}" style="height:40px;width:40px;'
            'object-fit:cover;border-radius:4px;" />',
            obj.image.url,
        )


class QuotationItemInline(admin.TabularInline):
    model = QuotationItem
    extra = 0
    readonly_fields = ("area", "total")


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_select_related = ("customer", "project")
    readonly_fields = ("subtotal", "gst_amount", "grand_total")
    inlines = [QuotationItemInline]

    def save_related(self, request, form, formsets, change):
        # Items are saved after the quotation, so the stored totals must be
        # recalculated here or they would show the old numbers.
        super().save_related(request, form, formsets, change)
        form.instance.recalculate_totals()

    list_display = (
        "quotation_no",
        "customer",
        "project",
        "date",
        "subject",
        "gst_percent",
        "status",
        "subtotal",
        "gst_amount",
        "grand_total",
    )

    search_fields = (
        "quotation_no",
        "customer__name",
        "customer__phone",
        "subject",
    )

    list_filter = (
        "status",
        "date",
    )


@admin.register(QuotationItem)
class QuotationItemAdmin(admin.ModelAdmin):
    readonly_fields = ("area", "total")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.quotation.recalculate_totals()

    list_display = (
        "quotation",
        "product",
        "category",
        "width",
        "height",
        "qty",
        "area",
        "rate",
        "total",
        "order",
    )

    search_fields = (
        "quotation__quotation_no",
        "category",
    )


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    readonly_fields = ("amount",)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_no",
        "customer",
        "project",
        "status",
        "grand_total",
        "paid_amount",
        "balance_amount",
        "invoice_date",
        "due_date",
    )
    list_filter = ("status", "invoice_date", "due_date")
    search_fields = ("invoice_no", "customer__name")
    ordering = ("-created_at",)
    readonly_fields = ("subtotal", "gst_amount", "grand_total", "balance_amount")
    list_select_related = ("customer", "project")
    inlines = [InvoiceItemInline]

    def save_related(self, request, form, formsets, change):
        # Inline items are saved after the invoice, so recalculate the totals
        # afterwards (they used to stay stale until the next API save).
        super().save_related(request, form, formsets, change)
        form.instance.recalculate_totals()