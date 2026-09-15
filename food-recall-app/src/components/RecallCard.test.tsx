import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Recall } from "../types/recall";
import RecallCard from "./RecallCard";

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
  ...overrides,
});

describe("RecallCard", () => {
  it("renders product description", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Chocolate Bar, 3oz")).toBeTruthy();
  });

  it("renders reason for recall", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Undeclared milk allergen")).toBeTruthy();
  });

  it("renders the risk word alongside the FDA class", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("High risk")).toBeTruthy();
    expect(screen.getByText("Class I")).toBeTruthy();
  });

  it("renders a derived reason category from the FDA reason text", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Undeclared allergen")).toBeTruthy();
  });

  it("renders no category when the reason matches no rule", () => {
    render(
      <RecallCard
        recall={makeRecall({ reasonForRecall: "Firm initiated recall" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.queryByText("Undeclared allergen")).toBeNull();
    expect(screen.queryByText("Pathogen")).toBeNull();
  });

  it("renders status badge", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Ongoing")).toBeTruthy();
  });

  it("renders firm location with the firm name when present", () => {
    render(<RecallCard recall={makeRecall({ state: "CA" })} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Test Corp · New York, CA")).toBeTruthy();
  });

  it("omits the location separator when city and state are empty", () => {
    render(
      <RecallCard recall={makeRecall({ city: "", state: "" })} onSelect={() => {}} isNew={false} watchlist={[]} />,
    );
    expect(screen.getByText("Test Corp")).toBeTruthy();
    expect(screen.queryByText(/^Test Corp ·/)).toBeNull();
  });

  it("renders the last-30-days chip when isNew is true", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={true} watchlist={[]} />);
    expect(screen.getByText("Last 30 days")).toBeTruthy();
  });

  it("does not render the last-30-days chip when isNew is false", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.queryByText("Last 30 days")).toBeNull();
  });

  it("calls onSelect when the title button is clicked", () => {
    const onSelect = vi.fn();
    const recall = makeRecall();
    render(<RecallCard recall={recall} onSelect={onSelect} isNew={false} watchlist={[]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(recall);
  });

  it("exposes exactly one native button so Enter and Space activate it natively", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].tagName).toBe("BUTTON");
    expect(buttons[0].getAttribute("type")).toBe("button");
  });

  it("has correct aria-label", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("View recall F-001-2026: Chocolate Bar, 3oz");
  });

  it("shows a Watching chip naming the matched term", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={["milk"]} />);
    expect(screen.getByText("Watching: milk")).toBeTruthy();
  });

  it("does not show a Watching chip when watchlist does not match", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={["sesame"]} />);
    expect(screen.queryByText(/Watching:/)).toBeNull();
  });

  it("shows a traceable dietary match chip when dietary concerns match", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} dietary={["milk"]} />);
    expect(screen.getByText(/Milk · reason: “milk”/)).toBeTruthy();
  });

  it("shows no-dietary-match message when dietary selected but no match", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} dietary={["sesame"]} />);
    expect(screen.getByText(/No dietary match/)).toBeTruthy();
  });

  it("does not show dietary info when no dietary concerns selected", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.queryByText(/reason: “/)).toBeNull();
    expect(screen.queryByText(/No dietary match/)).toBeNull();
  });

  it("renders formatted date with a machine-readable dateTime", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    const time = screen.getByText(/Jan 15, 2026/);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe("2026-01-15");
  });

  it("renders distribution pattern", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Sold in")).toBeTruthy();
    expect(screen.getByText("Nationwide", { selector: "dd" })).toBeTruthy();
  });

  it("uses dark-mode tokens that meet WCAG 2.1 AA on card labels and the Class I suffix", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Firm").className).toContain("dark:text-zinc-400");
    expect(screen.getByText("Sold in").className).toContain("dark:text-zinc-400");
    expect(screen.getByText("Class I").className).not.toContain("opacity-");
  });

  it("handles empty distribution pattern gracefully", () => {
    render(
      <RecallCard recall={makeRecall({ distributionPattern: "" })} onSelect={() => {}} isNew={false} watchlist={[]} />,
    );
    expect(screen.getByText("Not stated")).toBeTruthy();
  });

  it("renders Class II as moderate risk", () => {
    render(
      <RecallCard
        recall={makeRecall({ classification: "Class II" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.getByText("Moderate risk")).toBeTruthy();
    expect(screen.getByText("Class II")).toBeTruthy();
  });

  it("renders Class III as low risk", () => {
    render(
      <RecallCard
        recall={makeRecall({ classification: "Class III" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.getByText("Low risk")).toBeTruthy();
    expect(screen.getByText("Class III")).toBeTruthy();
  });

  it("names the specific hazard next to the category when the reason says so", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("· Undeclared milk")).toBeTruthy();
  });

  it("omits the hazard name when only the category is known", () => {
    render(
      <RecallCard
        recall={makeRecall({ reasonForRecall: "Undeclared allergen statement missing" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.getByText("Undeclared allergen")).toBeTruthy();
    expect(screen.queryByText(/^· /)).toBeNull();
  });

  it("shows a scope chip derived from the distribution text", () => {
    render(<RecallCard recall={makeRecall()} onSelect={() => {}} isNew={false} watchlist={[]} />);
    expect(screen.getByText("Nationwide", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Nationwide", { selector: "dd" })).toBeTruthy();
  });

  it("counts states for a partial distribution and hides the chip when the scope is unclear", () => {
    const { unmount } = render(
      <RecallCard
        recall={makeRecall({ distributionPattern: "AZ, CA, and TX" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.getByText("3 states").getAttribute("title")).toBe("AZ, CA, TX");
    unmount();
    render(
      <RecallCard
        recall={makeRecall({ distributionPattern: "retail only" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.queryByText(/state/)).toBeNull();
    expect(screen.queryByText("Unclear")).toBeNull();
  });

  it("renders unclassified records without inventing a class", () => {
    render(
      <RecallCard
        recall={makeRecall({ classification: "Not Yet Classified" })}
        onSelect={() => {}}
        isNew={false}
        watchlist={[]}
      />,
    );
    expect(screen.getByText("Not yet classified")).toBeTruthy();
    expect(screen.queryByText(/Class I/)).toBeNull();
  });
});
