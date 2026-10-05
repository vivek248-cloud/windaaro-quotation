from rest_framework.routers import DefaultRouter

from .views import (
    CustomerViewSet,
    ProjectViewSet,
    WorkEntryViewSet,
    ExpenseViewSet,
    PaymentViewSet,
    ProductViewSet,
    QuotationViewSet,
    InvoiceViewSet,
)


router = DefaultRouter()

router.register("customers", CustomerViewSet)
router.register("projects", ProjectViewSet)
router.register("work-entries", WorkEntryViewSet)
router.register("expenses", ExpenseViewSet)
router.register("payments", PaymentViewSet)
router.register("products", ProductViewSet)
router.register(r"quotations", QuotationViewSet)
router.register(r"invoices", InvoiceViewSet)


urlpatterns = router.urls