from datetime import date
from decimal import Decimal
from unittest import mock

from rest_framework.test import APITestCase

from .models import Payment, Quotation, QuotationItem


class BaseAPITestCase(APITestCase):
    def setUp(self):
        self.customer = self.client.post(
            "/api/customers/", {"name": "Ravi", "phone": "9999999999"}, format="json"
        ).json()
        self.project = self.client.post(
            "/api/projects/",
            {"customer": self.customer["id"], "name": "Villa", "budget": 100000},
            format="json",
        ).json()

    def make_quotation(self, number="WD2601", items=None):
        items = items or [
            {"category": "W", "width": 4, "height": 5, "qty": 1, "rate": 100}
        ]
        response = self.client.post(
            "/api/quotations/",
            {
                "customer": self.customer["id"],
                "quotation_no": number,
                "date": "2026-09-21",
                "gst_percent": 18,
                "items": items,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()


class PaymentTests(BaseAPITestCase):
    def payload(self, **extra):
        data = {
            "project": self.project["id"],
            "title": "Advance",
            "amount": 5000,
            "mode": "cash",
        }
        data.update(extra)
        return data

    def test_payment_date_sent_by_the_app_is_saved(self):
        response = self.client.post(
            "/api/payments/", self.payload(date="2026-01-05"), format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["date"], "2026-01-05")

    def test_payment_date_can_be_edited(self):
        created = self.client.post(
            "/api/payments/", self.payload(date="2026-01-05"), format="json"
        ).json()
        response = self.client.put(
            f"/api/payments/{created['id']}/",
            self.payload(date="2026-01-06"),
            format="json",
        )
        self.assertEqual(response.json()["date"], "2026-01-06")

    def test_payment_date_defaults_to_today_when_omitted(self):
        response = self.client.post("/api/payments/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Payment.objects.get().date, date.today())

    def test_zero_and_negative_amounts_are_rejected(self):
        for amount in (0, -500):
            response = self.client.post(
                "/api/payments/", self.payload(amount=amount), format="json"
            )
            self.assertEqual(response.status_code, 400, amount)

        response = self.client.post(
            "/api/expenses/",
            {"project": self.project["id"], "title": "Cement", "amount": -900},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class QuotationTests(BaseAPITestCase):
    def test_totals_use_rounded_area_like_the_form(self):
        quotation = self.make_quotation(
            "R1",
            [{"category": "W", "width": "1.23", "height": "1.47", "qty": "3", "rate": "500"}],
        )
        item = quotation["items"][0]
        self.assertEqual(Decimal(item["area"]), Decimal("5.42"))
        self.assertEqual(Decimal(item["total"]), Decimal("2710.00"))
        self.assertEqual(Decimal(quotation["grand_total"]), Decimal("3197.80"))

    def test_failed_edit_keeps_the_original_items(self):
        quotation = self.make_quotation(
            "A1",
            [
                {"category": "W", "width": 4, "height": 5, "qty": 1, "rate": 100},
                {"category": "W", "width": 2, "height": 2, "qty": 1, "rate": 100},
            ],
        )
        real_create = QuotationItem.objects.create
        calls = {"n": 0}

        def flaky(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("simulated database failure")
            return real_create(*args, **kwargs)

        body = {
            "customer": self.customer["id"],
            "quotation_no": "A1",
            "date": "2026-09-21",
            "gst_percent": 18,
            "items": [{"category": "W", "width": 1, "height": 1, "qty": 1, "rate": 1}] * 3,
        }
        self.client.raise_request_exception = False
        with mock.patch.object(QuotationItem.objects, "create", side_effect=flaky):
            response = self.client.put(
                f"/api/quotations/{quotation['id']}/", body, format="json"
            )
        self.assertEqual(response.status_code, 500)

        saved = Quotation.objects.get(pk=quotation["id"])
        self.assertEqual(saved.items.count(), 2)  # nothing was lost
        self.assertEqual(saved.grand_total, Decimal(quotation["grand_total"]))

    def test_oversized_row_is_a_400_not_a_crash(self):
        response = self.client.post(
            "/api/quotations/",
            {
                "customer": self.customer["id"],
                "quotation_no": "BIG",
                "date": "2026-09-21",
                "gst_percent": 18,
                "items": [
                    {"category": "W", "width": 90000, "height": 90000, "qty": 900, "rate": 500}
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Quotation.objects.filter(quotation_no="BIG").exists())

    def test_gst_percent_must_be_between_0_and_100(self):
        response = self.client.post(
            "/api/quotations/",
            {
                "customer": self.customer["id"],
                "quotation_no": "GST",
                "date": "2026-09-21",
                "gst_percent": 180,
                "items": [{"category": "W", "qty": 1, "rate": 100}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class InvoiceTests(BaseAPITestCase):
    def test_invoice_totals_and_balance(self):
        response = self.client.post(
            "/api/invoices/",
            {
                "customer": self.customer["id"],
                "invoice_no": "INV2601",
                "invoice_date": "2026-09-21",
                "gst_percent": 18,
                "discount": 100,
                "paid_amount": 500,
                "items": [
                    {"description": "Window", "unit": "nos", "quantity": "3.33", "rate": "10.55"}
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(Decimal(data["items"][0]["amount"]), Decimal("35.13"))
        self.assertEqual(Decimal(data["subtotal"]), Decimal("35.13"))
        # discount larger than the subtotal never makes the total negative
        self.assertEqual(Decimal(data["grand_total"]), Decimal("0.00"))

    def test_negative_discount_is_rejected(self):
        response = self.client.post(
            "/api/invoices/",
            {
                "customer": self.customer["id"],
                "invoice_no": "INV2602",
                "invoice_date": "2026-09-21",
                "discount": -50,
                "items": [{"description": "x", "quantity": 1, "rate": 10}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class ProjectTests(BaseAPITestCase):
    def test_outstanding_balance_is_budget_minus_paid(self):
        self.client.post(
            "/api/payments/",
            {"project": self.project["id"], "title": "Adv", "amount": 30000, "mode": "upi"},
            format="json",
        )
        projects = self.client.get("/api/projects/").json()
        self.assertEqual(Decimal(projects[0]["outstanding_balance"]), Decimal("70000.00"))
        self.assertEqual(Decimal(projects[0]["total_paid"]), Decimal("30000.00"))

    def test_project_list_uses_a_constant_number_of_queries(self):
        for n in range(5):
            self.client.post(
                "/api/projects/",
                {"customer": self.customer["id"], "name": f"P{n}", "budget": 10},
                format="json",
            )
        with self.assertNumQueries(3):  # projects + expenses + payments
            self.client.get("/api/projects/")
