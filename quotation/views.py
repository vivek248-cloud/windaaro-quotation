from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import (
    Customer,
    Project,
    WorkEntry,
    Expense,
    Payment,
    Product,
    Quotation,
    Invoice,
)

from .serializers import (
    CustomerSerializer,
    ProjectSerializer,
    WorkEntrySerializer,
    ExpenseSerializer,
    PaymentSerializer,
    ProductSerializer,
    QuotationSerializer,
    InvoiceSerializer,
)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("-created_at")
    serializer_class = CustomerSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    # customer name + the expenses/payments used for the money totals are
    # loaded up-front (was: several extra queries for every project row).
    queryset = (
        Project.objects.all()
        .select_related("customer")
        .prefetch_related("expenses", "payments")
        .order_by("-created_at")
    )
    serializer_class = ProjectSerializer


class WorkEntryViewSet(viewsets.ModelViewSet):
    queryset = WorkEntry.objects.all().order_by("-created_at")
    serializer_class = WorkEntrySerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by("-date")
    serializer_class = ExpenseSerializer


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all().order_by("-date")
    serializer_class = PaymentSerializer


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("name")
    serializer_class = ProductSerializer
    # multipart = image upload from the Add Product form; JSON = quick PATCHes
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()

        # Old quotations / invoices still print this product's photo, so a
        # product that has been used is deactivated instead of deleted.
        if (
            product.quotation_items.exists()
            or product.invoice_items.exists()
        ):
            return Response(
                {
                    "detail": (
                        "This product is used in existing quotations or "
                        "invoices, so it cannot be deleted. Mark it as "
                        "inactive instead."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        return super().destroy(request, *args, **kwargs)


class QuotationViewSet(viewsets.ModelViewSet):
    queryset = Quotation.objects.all().prefetch_related("items__product").select_related(
        "customer", "project"
    )
    serializer_class = QuotationSerializer


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all().prefetch_related("items__product").select_related(
        "customer", "project"
    )
    serializer_class = InvoiceSerializer