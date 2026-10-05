from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import (
    MAX_AREA,
    MAX_MONEY,
    Customer,
    Expense,
    Invoice,
    InvoiceItem,
    Payment,
    Product,
    Project,
    Quotation,
    QuotationItem,
    WorkEntry,
    calc_invoice_item,
    calc_quotation_item,
)


def _require_positive(value, label="Amount"):
    if value <= 0:
        raise serializers.ValidationError(f"{label} must be greater than zero.")
    return value


def _require_percent(value):
    if value < 0 or value > 100:
        raise serializers.ValidationError("GST % must be between 0 and 100.")
    return value


def _require_not_negative(value, label):
    if value < 0:
        raise serializers.ValidationError(f"{label} cannot be negative.")
    return value


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


class WorkEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkEntry
        fields = "__all__"
        read_only_fields = ["amount"]  # always quantity x area x rate

    def validate(self, attrs):
        for name in ("quantity", "area_size", "rate"):
            if name in attrs:
                _require_not_negative(attrs[name], name.replace("_", " ").title())
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = "__all__"

    def validate_amount(self, value):
        return _require_positive(value)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"

    def validate_amount(self, value):
        return _require_positive(value)


class ProjectSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.name",
        read_only=True,
    )

    total_spend = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    total_paid = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    outstanding_balance = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Project
        fields = "__all__"


MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _absolute_product_image(serializer, product):
    """Absolute URL of a product's photo (or None) for nested item output."""
    if not product or not product.image:
        return None

    url = product.image.url
    request = serializer.context.get("request")
    return request.build_absolute_uri(url) if request else url


class ProductSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)

    # Write-only flag so the frontend can ask for the photo to be removed
    # (a multipart form can't simply "send null").
    remove_image = serializers.BooleanField(
        write_only=True, required=False, default=False
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "code",
            "category",
            "description",
            "unit",
            "rate",
            "image",
            "remove_image",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def validate_image(self, value):
        if value and value.size > MAX_PRODUCT_IMAGE_BYTES:
            raise serializers.ValidationError("Image must be 5 MB or smaller.")
        return value

    def validate_rate(self, value):
        if value < 0:
            raise serializers.ValidationError("Rate cannot be negative.")
        return value

    def create(self, validated_data):
        validated_data.pop("remove_image", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remove_image = validated_data.pop("remove_image", False)
        new_image = validated_data.get("image")

        old_name = instance.image.name if instance.image else None
        storage = instance.image.storage

        if remove_image and not new_image:
            validated_data["image"] = None

        instance = super().update(instance, validated_data)

        # Delete the old file only once the change is safely saved, so a failed
        # save can no longer leave the product pointing at a deleted photo.
        if old_name and (new_image or remove_image):
            if not instance.image or instance.image.name != old_name:
                storage.delete(old_name)

        return instance


class QuotationItemSerializer(serializers.ModelSerializer):
    # Accepted on input (so edits can match existing rows) but not required —
    # new rows sent without an id are simply recreated.
    id = serializers.IntegerField(required=False)
    product_name = serializers.SerializerMethodField()
    product_image = serializers.SerializerMethodField()

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_product_image(self, obj):
        return _absolute_product_image(self, obj.product)

    class Meta:
        model = QuotationItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_image",
            "category",
            "width",
            "height",
            "qty",
            "area",
            "rate",
            "total",
            "order",
        ]
        read_only_fields = ["area", "total"]

    def validate(self, attrs):
        for name in ("width", "height", "qty", "rate"):
            value = attrs.get(name)
            if value is not None:
                _require_not_negative(value, name.title())

        area, total = calc_quotation_item(
            attrs.get("width"),
            attrs.get("height"),
            attrs.get("qty", Decimal("1")),
            attrs.get("rate", Decimal("0")),
        )
        if (area is not None and area > MAX_AREA) or total > MAX_MONEY:
            raise serializers.ValidationError(
                "This row is too large - check the width, height, quantity "
                "and rate (are the sizes in feet, not millimetres?)."
            )
        return attrs


class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True)

    class Meta:
        model = Quotation
        fields = [
            "id",
            "customer",
            "project",
            "quotation_no",
            "date",
            "subject",
            "phone",
            "gst_percent",
            "status",
            "terms",
            "subtotal",
            "gst_amount",
            "grand_total",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["subtotal", "gst_amount", "grand_total"]

    def validate_gst_percent(self, value):
        return _require_percent(value)

    def validate(self, attrs):
        items = attrs.get("items")
        if items is not None:
            subtotal = sum(
                (
                    calc_quotation_item(
                        i.get("width"),
                        i.get("height"),
                        i.get("qty", Decimal("1")),
                        i.get("rate", Decimal("0")),
                    )[1]
                    for i in items
                ),
                Decimal("0"),
            )
            if subtotal * Decimal("2") > MAX_MONEY:  # room for GST
                raise serializers.ValidationError(
                    {"items": "The quotation total is too large - please check the rows."}
                )
        return attrs

    def _sync_items(self, quotation, items_data):
        # Simplest correct approach for a small business tool: replace all
        # items on every save rather than diffing id-by-id. Keeps the
        # frontend's "just send the whole items array" pattern simple.
        quotation.items.all().delete()

        for index, item_data in enumerate(items_data):
            item_data.pop("id", None)
            order = item_data.pop("order", index)

            QuotationItem.objects.create(
                quotation=quotation, order=order, **item_data
            )

        quotation.recalculate_totals()

    # atomic: if anything fails half way, the old items are kept (nothing is
    # deleted and nothing is left half-created).
    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        quotation = Quotation.objects.create(**validated_data)
        self._sync_items(quotation, items_data)
        return quotation

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            self._sync_items(instance, items_data)
        else:
            instance.recalculate_totals()

        return instance


class InvoiceItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    product_name = serializers.SerializerMethodField()
    product_image = serializers.SerializerMethodField()

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_product_image(self, obj):
        return _absolute_product_image(self, obj.product)

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_image",
            "description",
            "unit",
            "quantity",
            "rate",
            "amount",
            "order",
        ]
        read_only_fields = ["amount"]

    def validate(self, attrs):
        for name in ("quantity", "rate"):
            value = attrs.get(name)
            if value is not None:
                _require_not_negative(value, name.title())

        amount = calc_invoice_item(
            attrs.get("quantity", Decimal("1")), attrs.get("rate", Decimal("0"))
        )
        if amount > MAX_MONEY:
            raise serializers.ValidationError(
                "This row is too large - check the quantity and rate."
            )
        return attrs


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "customer",
            "project",
            "invoice_no",
            "invoice_date",
            "due_date",
            "gst_percent",
            "discount",
            "paid_amount",
            "status",
            "terms",
            "subtotal",
            "gst_amount",
            "grand_total",
            "balance_amount",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["subtotal", "gst_amount", "grand_total", "balance_amount"]

    def validate_gst_percent(self, value):
        return _require_percent(value)

    def validate_discount(self, value):
        return _require_not_negative(value, "Discount")

    def validate_paid_amount(self, value):
        return _require_not_negative(value, "Paid amount")

    def validate(self, attrs):
        items = attrs.get("items")
        if items is not None:
            subtotal = sum(
                (
                    calc_invoice_item(
                        i.get("quantity", Decimal("1")), i.get("rate", Decimal("0"))
                    )
                    for i in items
                ),
                Decimal("0"),
            )
            if subtotal * Decimal("2") > MAX_MONEY:
                raise serializers.ValidationError(
                    {"items": "The invoice total is too large - please check the rows."}
                )
        return attrs

    def _sync_items(self, invoice, items_data):
        invoice.items.all().delete()

        for index, item_data in enumerate(items_data):
            item_data.pop("id", None)
            order = item_data.pop("order", index)

            InvoiceItem.objects.create(invoice=invoice, order=order, **item_data)

        invoice.recalculate_totals()

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        invoice = Invoice.objects.create(**validated_data)
        self._sync_items(invoice, items_data)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            self._sync_items(instance, items_data)
        else:
            instance.recalculate_totals()

        return instance