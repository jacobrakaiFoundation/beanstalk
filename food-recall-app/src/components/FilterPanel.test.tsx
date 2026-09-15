import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FilterPanel from "./FilterPanel";

describe("FilterPanel", () => {
  const defaultProps = {
    classification: "" as const,
    status: "",
    state: "",
    dietary: [],
    onClassification: vi.fn(),
    onStatus: vi.fn(),
    onState: vi.fn(),
    onDietary: vi.fn(),
    onClear: vi.fn(),
  };

  it("renders heading", () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByText("Filters")).toBeTruthy();
  });

  it("renders classification select with all options", () => {
    render(<FilterPanel {...defaultProps} />);
    const select = screen.getByLabelText("Classification");
    expect(select).toBeTruthy();
    expect(screen.getByText("All classes")).toBeTruthy();
    expect(screen.getByText("Class I")).toBeTruthy();
    expect(screen.getByText("Class II")).toBeTruthy();
    expect(screen.getByText("Class III")).toBeTruthy();
  });

  it("renders status select with all options", () => {
    render(<FilterPanel {...defaultProps} />);
    const select = screen.getByLabelText("Status");
    expect(select).toBeTruthy();
    expect(screen.getByText("All statuses")).toBeTruthy();
    expect(screen.getByText("Ongoing")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Terminated")).toBeTruthy();
  });

  it("calls onClassification when classification changes", () => {
    const onClassification = vi.fn();
    render(<FilterPanel {...defaultProps} onClassification={onClassification} />);
    fireEvent.change(screen.getByLabelText("Classification"), { target: { value: "Class I" } });
    expect(onClassification).toHaveBeenCalledWith("Class I");
  });

  it("calls onStatus when status changes", () => {
    const onStatus = vi.fn();
    render(<FilterPanel {...defaultProps} onStatus={onStatus} />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Ongoing" } });
    expect(onStatus).toHaveBeenCalledWith("Ongoing");
  });

  it("calls onClear when clear button clicked", () => {
    const onClear = vi.fn();
    render(<FilterPanel {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText("Clear all filters"));
    expect(onClear).toHaveBeenCalled();
  });

  it("displays current classification value", () => {
    render(<FilterPanel {...defaultProps} classification="Class I" />);
    const select = screen.getByLabelText("Classification") as HTMLSelectElement;
    expect(select.value).toBe("Class I");
  });

  it("has accessible labels for all selects", () => {
    render(<FilterPanel {...defaultProps} />);
    expect(screen.getByLabelText("Classification")).toBeTruthy();
    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Source")).toBeTruthy();
    expect(screen.getByLabelText("Distribution State")).toBeTruthy();
  });

  it("calls onSource when the source filter changes", () => {
    const onSource = vi.fn();
    render(<FilterPanel {...defaultProps} onSource={onSource} />);
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "USDA-FSIS" } });
    expect(onSource).toHaveBeenCalledWith("USDA-FSIS");
  });
});
