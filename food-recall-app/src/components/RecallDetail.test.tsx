import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { Recall } from "../types/recall";
import RecallDetail from "./RecallDetail";

const makeRecall = (overrides: Partial<Recall> = {}): Recall => ({
  id: "F-001-2026",
  recallNumber: "F-001-2026",
  eventId: "90001",
  productDescription: "Chocolate Bar, 3oz",
  reasonForRecall: "Undeclared milk allergen",
  classification: "Class I",
  status: "Ongoing",
  distributionPattern: "Nationwide",
  recallingFirm: "Test Corp",
  city: "New York",
  state: "NY",
  country: "United States",
  recallInitiationDate: "20260115",
  productType: "Food",
  codeInfo: "Lot 123",
  moreCodeInfo: "",
  voluntaryMandated: "Voluntary: Firm Initiated",
  address1: "",
  address2: "",
  postalCode: "",
  centerClassificationDate: "",
  initialFirmNotification: "",
  productQuantity: "",
  terminationDate: "",
  source: "FDA",
  ...overrides,
});

describe("RecallDetail", () => {
  it("renders product description as heading", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Chocolate Bar, 3oz")).toBeTruthy();
  });

  it("renders recall number and event ID", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText(/F-001-2026/)).toBeTruthy();
    expect(screen.getByText(/90001/)).toBeTruthy();
  });

  it("renders classification", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Class I")).toBeTruthy();
  });

  it("renders status", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Ongoing")).toBeTruthy();
    expect(screen.getByText(/as published by openFDA/i)).toBeTruthy();
  });

  it("renders reason for recall", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Undeclared milk allergen")).toBeTruthy();
  });

  it("renders firm and location", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText(/Test Corp/)).toBeTruthy();
    expect(screen.getByText(/New York, NY/)).toBeTruthy();
  });

  it("renders distribution pattern", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Nationwide")).toBeTruthy();
  });

  it("renders code info", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Lot 123")).toBeTruthy();
  });

  it("renders formatted initiation date", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText(/Jan 15, 2026/)).toBeTruthy();
  });

  it("renders voluntary/mandated", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByText("Voluntary: Firm Initiated")).toBeTruthy();
  });

  it("conditionally renders moreCodeInfo when present", () => {
    render(<RecallDetail recall={makeRecall({ moreCodeInfo: "Extra lots: A, B" })} onClose={() => {}} />);
    expect(screen.getByText(/More Code Info/)).toBeTruthy();
    expect(screen.getByText("Extra lots: A, B")).toBeTruthy();
  });

  it("does not render moreCodeInfo when empty", () => {
    render(<RecallDetail recall={makeRecall({ moreCodeInfo: "" })} onClose={() => {}} />);
    expect(screen.queryByText(/More Code Info/)).toBeNull();
  });

  it("conditionally renders termination date", () => {
    render(<RecallDetail recall={makeRecall({ terminationDate: "20260601" })} onClose={() => {}} />);
    expect(screen.getByText(/Termination Date/)).toBeTruthy();
    expect(screen.getByText(/Jun 1, 2026/)).toBeTruthy();
  });

  it("conditionally renders product quantity", () => {
    render(<RecallDetail recall={makeRecall({ productQuantity: "5,000 units" })} onClose={() => {}} />);
    expect(screen.getByText("5,000 units")).toBeTruthy();
  });

  it("conditionally renders firm address", () => {
    render(<RecallDetail recall={makeRecall({ address1: "123 Main St", postalCode: "10001" })} onClose={() => {}} />);
    expect(screen.getByText(/Firm Address/)).toBeTruthy();
    expect(screen.getByText(/123 Main St/)).toBeTruthy();
  });

  it("calls onClose when Close button clicked", () => {
    const onClose = vi.fn();
    render(<RecallDetail recall={makeRecall()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close recall details"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<RecallDetail recall={makeRecall()} onClose={onClose} />);
    // The backdrop is the first flex-1 div with bg-black/40
    const backdrop = document.querySelector(".bg-black\\/40");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<RecallDetail recall={makeRecall()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has dialog role and aria-modal", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("has accessible close button label", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByLabelText("Close recall details")).toBeTruthy();
  });

  it("has aria-labelledby linking to heading", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("recall-title");
    expect(document.getElementById("recall-title")).toBeTruthy();
  });

  it("renders FDA link with rel=noreferrer", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    const link = screen.getByText(/View on FDA/);
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("does not render quantity section when empty", () => {
    render(<RecallDetail recall={makeRecall({ productQuantity: "" })} onClose={() => {}} />);
    expect(screen.queryByText("Quantity")).toBeNull();
  });

  it("renders firm notification when present", () => {
    render(<RecallDetail recall={makeRecall({ initialFirmNotification: "Phone" })} onClose={() => {}} />);
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByText("Firm Notification")).toBeTruthy();
  });

  it("does not render firm notification section when empty", () => {
    render(<RecallDetail recall={makeRecall({ initialFirmNotification: "" })} onClose={() => {}} />);
    expect(screen.queryByText("Firm Notification")).toBeNull();
  });

  it("does not render address section when all address fields empty", () => {
    render(<RecallDetail recall={makeRecall({ address1: "", address2: "", postalCode: "" })} onClose={() => {}} />);
    expect(screen.queryByText("Firm Address")).toBeNull();
  });

  it("renders FDA classification date when present", () => {
    render(<RecallDetail recall={makeRecall({ centerClassificationDate: "20260201" })} onClose={() => {}} />);
    expect(screen.getByText(/FDA Classification Date/)).toBeTruthy();
  });

  it("does not render FDA classification date when empty", () => {
    render(<RecallDetail recall={makeRecall({ centerClassificationDate: "" })} onClose={() => {}} />);
    expect(screen.queryByText("FDA Classification Date")).toBeNull();
  });

  it("generates correct FDA deep link", () => {
    render(<RecallDetail recall={makeRecall({ productDescription: "Organic Peanut Butter" })} onClose={() => {}} />);
    const fdaLink = screen.getByText(/View on FDA Enforcement Reports/);
    expect(fdaLink.getAttribute("href")).toContain("accessdata.fda.gov/scripts/ires/index.cfm");
    expect(fdaLink.getAttribute("href")).toContain(encodeURIComponent("Organic Peanut Butter"));
    expect(fdaLink.getAttribute("target")).toBe("_blank");
  });

  it("generates correct openFDA raw JSON link", () => {
    render(<RecallDetail recall={makeRecall({ recallNumber: "F-1234-2025" })} onClose={() => {}} />);
    const rawLink = screen.getByText("raw openFDA JSON");
    expect(rawLink.getAttribute("href")).toContain("api.fda.gov/food/enforcement.json");
    expect(rawLink.getAttribute("href")).toContain("F-1234-2025");
  });

  it("FDA deep link truncates long product descriptions", () => {
    render(<RecallDetail recall={makeRecall({ productDescription: "A".repeat(200) })} onClose={() => {}} />);
    const href = screen.getByText(/View on FDA Enforcement Reports/).getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href);
    const productParam = decoded.match(/Product=([^&#]+)/)?.[1] ?? "";
    expect(productParam.length).toBeGreaterThan(0);
    expect(productParam.length).toBeLessThanOrEqual(80);
  });

  it("renders code info dash when empty", () => {
    render(<RecallDetail recall={makeRecall({ codeInfo: "" })} onClose={() => {}} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders FSIS provenance: source, establishment, FSIS link, no FDA links", () => {
    render(
      <RecallDetail
        recall={makeRecall({
          source: "USDA-FSIS",
          recallNumber: "FSIS-021-2026",
          eventId: "",
          productDescription: "Pork Cracklings",
          establishmentNumber: "Est. 123",
          hazard: "Import Violation",
          link: "http://www.fsis.usda.gov/recalls-alerts/test",
          moreCodeInfo: "Summary excerpt",
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("USDA-FSIS")).toBeTruthy();
    expect(screen.getByText("Est. 123")).toBeTruthy();
    expect(screen.getByText(/View on FSIS/)).toBeTruthy();
    expect(screen.getByText(/View on FSIS/).getAttribute("href")).toBe("http://www.fsis.usda.gov/recalls-alerts/test");
    expect(screen.queryByText(/View on FDA/)).toBeNull();
    expect(screen.queryByText("raw openFDA JSON")).toBeNull();
  });

  it("focuses the close button on mount", () => {
    render(<RecallDetail recall={makeRecall()} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();
  });

  it("handles minimal recall with all empty optional fields", () => {
    render(
      <RecallDetail
        recall={makeRecall({
          productDescription: "Generic Widget",
          recallNumber: "F-5678-2025",
          classification: "Class II",
          distributionPattern: "",
          city: "",
          state: "",
          codeInfo: "",
          moreCodeInfo: "",
          address1: "",
          address2: "",
          postalCode: "",
          centerClassificationDate: "",
          initialFirmNotification: "",
          productQuantity: "",
          terminationDate: "",
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Generic Widget")).toBeTruthy();
    expect(screen.getByText(/F-5678-2025/)).toBeTruthy();
    expect(screen.getByText("Class II")).toBeTruthy();
    expect(screen.queryByText("Termination Date")).toBeNull();
    expect(screen.queryByText("Quantity")).toBeNull();
    expect(screen.queryByText("Firm Notification")).toBeNull();
    expect(screen.queryByText("Firm Address")).toBeNull();
    expect(screen.queryByText(/More Code Info/)).toBeNull();
  });
});
