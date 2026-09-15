import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { fetchRecalls } from "./lib/api";
import type { Recall } from "./types/recall";

const fetchRecallsMock = vi.mocked(fetchRecalls);
type FetchRecallsResult = Awaited<ReturnType<typeof fetchRecalls>>;

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

const makeFetchResult = (overrides: Partial<FetchRecallsResult> = {}): FetchRecallsResult => ({
  recalls: [],
  total: 0,
  error: null,
  isStale: false,
  lastSynced: null,
  isDemo: false,
  ...overrides,
});

const stubMatchMedia = () => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

// Mock API
vi.mock("./lib/api", () => ({
  fetchRecalls: vi.fn().mockResolvedValue({ recalls: [], total: 0, error: null, isStale: false, isDemo: false }),
  getLastSynced: vi.fn().mockReturnValue(new Date().toISOString()),
}));

vi.mock("./lib/events", () => ({
  fetchAdverseEvents: vi.fn().mockResolvedValue({ events: [], total: 0, error: null, isStale: false, isDemo: false }),
  getEventLastSynced: vi.fn().mockReturnValue(null),
  eventSearchText: vi.fn().mockReturnValue(""),
}));

// Mock notifications module (we spy on individual exports)
const mockRequestPermission = vi.fn();
vi.mock("./lib/notifications", () => ({
  requestNotificationPermission: (...args: unknown[]) => mockRequestPermission(...args),
  sendNotification: vi.fn(),
  getPermissionStatus: () => mockGetPermissionStatus(),
}));

let mockGetPermissionStatus: () => string = () => "default";

const mockNotificationAPI = (permission: string) => {
  const mock = vi.fn() as any;
  mock.permission = permission;
  mock.requestPermission = vi.fn().mockResolvedValue(permission);
  vi.stubGlobal("Notification", mock);
};

const removeNotificationAPI = () => {
  vi.unstubAllGlobals();
};

describe("App notification integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetPermissionStatus = () => "default";
    stubMatchMedia();
  });

  afterEach(() => {
    removeNotificationAPI();
  });

  it("initializes notificationsEnabled as false when permission is not granted", () => {
    removeNotificationAPI();
    render(<App />);
    // Button should appear because notifications are not enabled and permission is not denied
    expect(screen.getByRole("button", { name: /enable browser alert/i })).toBeInTheDocument();
  });

  it("initializes notificationsEnabled as true when permission is granted and localStorage preference is set", async () => {
    mockNotificationAPI("granted");
    mockGetPermissionStatus = () => "granted";
    localStorage.setItem("notificationsEnabled", "true");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/alerts on/i)).toBeInTheDocument();
    });
    // Enable Alerts button should NOT be present
    expect(screen.queryByRole("button", { name: /enable browser alert/i })).not.toBeInTheDocument();
  });

  it("initializes notificationsEnabled as false when permission is granted but localStorage preference is not set", () => {
    mockNotificationAPI("granted");
    mockGetPermissionStatus = () => "granted";
    // localStorage has no notificationsEnabled key
    render(<App />);
    expect(screen.getByRole("button", { name: /enable browser alert/i })).toBeInTheDocument();
  });

  it("hides Enable Alerts button when permission is denied", () => {
    mockNotificationAPI("denied");
    mockGetPermissionStatus = () => "denied";
    render(<App />);
    expect(screen.queryByRole("button", { name: /enable browser alert/i })).not.toBeInTheDocument();
  });

  it("clicking Enable Alerts calls requestNotificationPermission", async () => {
    mockNotificationAPI("default");
    mockGetPermissionStatus = () => "default";
    mockRequestPermission.mockResolvedValue(true);
    render(<App />);

    const button = await screen.findByRole("button", { name: /enable browser alert/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });
  });

  it("updates state to enabled after permission is granted", async () => {
    mockNotificationAPI("default");
    mockGetPermissionStatus = () => "default";
    mockRequestPermission.mockResolvedValue(true);
    render(<App />);

    const button = await screen.findByRole("button", { name: /enable browser alert/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/alerts on/i)).toBeInTheDocument();
    });
  });

  it("persists preference to localStorage after enabling", async () => {
    mockNotificationAPI("default");
    mockGetPermissionStatus = () => "default";
    mockRequestPermission.mockResolvedValue(true);
    render(<App />);

    const button = await screen.findByRole("button", { name: /enable browser alert/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(localStorage.getItem("notificationsEnabled")).toBe("true");
    });
  });

  it("remains disabled if permission is denied after clicking Enable Alerts", async () => {
    mockNotificationAPI("default");
    mockGetPermissionStatus = () => "default";
    mockRequestPermission.mockResolvedValue(false);
    render(<App />);

    const button = await screen.findByRole("button", { name: /enable browser alert/i });
    fireEvent.click(button);

    // Wait a tick for the async handler
    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });
    // Button should still be visible (state is false)
    expect(screen.getByRole("button", { name: /enable browser alert/i })).toBeInTheDocument();
  });
});

describe("App search and pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetPermissionStatus = () => "denied";
    fetchRecallsMock.mockResolvedValue(makeFetchResult());
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders app header with Beanstalk title", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /beanstalk/i })).toBeInTheDocument());
  });

  it("renders BeanstalkMark and sprouting lowercase wordmark in the header", async () => {
    render(<App />);
    const heading = await screen.findByRole("heading", { name: /beanstalk fda and usda fsis food recall explorer/i });
    expect(heading.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    expect(heading.textContent).toMatch(/beanstalk/i);
    expect(heading.querySelector(".sprouting-b")).toBeTruthy();
    expect(heading.querySelector(".wordmark-leaves")).toBeTruthy();
  });

  it("debounces search input — fetchRecalls not called immediately on typing", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Product, reason, firm/)).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/Product, reason, firm/);
    const callCountBefore = fetchRecallsMock.mock.calls.length;

    fireEvent.change(searchInput, { target: { value: "peanut" } });

    expect(fetchRecallsMock.mock.calls.length).toBe(callCountBefore);

    await waitFor(
      () => {
        const lastCall = fetchRecallsMock.mock.calls[fetchRecallsMock.mock.calls.length - 1]?.[0];
        expect(lastCall?.search).toBe("peanut");
      },
      { timeout: 2000 },
    );
  });

  it("resets page to 0 when debounced search changes", async () => {
    const mockData = Array.from({ length: 6 }, (_, i) => makeRecall({ id: `F-${i}`, recallNumber: `F-${i}` }));
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: mockData, total: 12 }));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Page 2/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Product, reason, firm/), { target: { value: "milk" } });

    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it("disables Previous button on first page", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it('shows "No recalls match your filters" when empty and not loading', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No recalls match your filters/)).toBeInTheDocument());
  });

  it("renders recall cards when data is available", async () => {
    fetchRecallsMock.mockResolvedValue(
      makeFetchResult({
        recalls: [makeRecall({ id: "F-100", productDescription: "Tasty Cookies" })],
        total: 1,
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText("Tasty Cookies")).toBeInTheDocument());
  });

  it("navigates pages with Next and Previous buttons", async () => {
    const mockData = Array.from({ length: 6 }, (_, i) => makeRecall({ id: `F-${i}`, recallNumber: `F-${i}` }));
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: mockData, total: 12 }));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Page 2/)).toBeInTheDocument());

    const lastCallArgs = fetchRecallsMock.mock.calls[fetchRecallsMock.mock.calls.length - 1]?.[0];
    expect(lastCallArgs?.skip).toBe(6);

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());
  });

  it("clamps page when total shrinks below current page", async () => {
    const manyResults = Array.from({ length: 6 }, (_, i) => makeRecall({ id: `F-${i}`, recallNumber: `F-${i}` }));
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: manyResults, total: 30 }));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/Page 2/)).toBeInTheDocument());

    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: manyResults, total: 6 }));
    fireEvent.change(screen.getByPlaceholderText(/Product, reason, firm/), { target: { value: "narrow" } });

    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it("shows stale banner when data is stale", async () => {
    fetchRecallsMock.mockResolvedValue(
      makeFetchResult({
        recalls: [makeRecall({ productDescription: "Stale Product" })],
        total: 1,
        error: { code: "NETWORK", message: "Network error", retryable: true },
        isStale: true,
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Stale cached data/)).toBeInTheDocument());
    expect(screen.getByText(/Retry/)).toBeInTheDocument();
  });

  it("shows demo banner when in demo mode", async () => {
    fetchRecallsMock.mockResolvedValue(
      makeFetchResult({
        recalls: [makeRecall({ id: "DEMO-F-1", productDescription: "DEMO Product" })],
        total: 1,
        isDemo: true,
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText(/DEMO MODE/)).toBeInTheDocument());
  });

  it("shows error message when fetch fails and no cached data", async () => {
    fetchRecallsMock.mockResolvedValue(
      makeFetchResult({
        error: { code: "NETWORK", message: "Connection failed", retryable: true },
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Failed to load recalls/)).toBeInTheDocument());
  });

  it("shows truncated window message when total exceeds FDA max offset", async () => {
    const mockData = Array.from({ length: 6 }, (_, i) => makeRecall({ id: `F-${i}`, recallNumber: `F-${i}` }));
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: mockData, total: 50000 }));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/FDA's offset limit/)).toBeInTheDocument());
  });

  it("abort controller racing: rapid fetches only use latest result", async () => {
    let firstCallResolve!: (value: FetchRecallsResult) => void;
    const firstCallPromise = new Promise<FetchRecallsResult>((resolve) => {
      firstCallResolve = resolve;
    });
    const secondCallResult = makeFetchResult({
      recalls: [makeRecall({ id: "F-2", productDescription: "Second Result" })],
      total: 1,
    });

    fetchRecallsMock.mockReturnValueOnce(firstCallPromise).mockResolvedValueOnce(secondCallResult);

    render(<App />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Product, reason, firm/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Product, reason, firm/), { target: { value: "first" } });
    await new Promise((r) => setTimeout(r, 500));

    firstCallResolve(
      makeFetchResult({
        recalls: [makeRecall({ id: "F-1", productDescription: "First Result" })],
        total: 1,
      }),
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText("First Result")).not.toBeInTheDocument();
  });

  it("fetchRecalls is called with skip capped at 25000", async () => {
    const mockData = Array.from({ length: 6 }, (_, i) => makeRecall({ id: `F-${i}`, recallNumber: `F-${i}` }));
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: mockData, total: 100000 }));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1/)).toBeInTheDocument());

    for (const call of fetchRecallsMock.mock.calls) {
      expect(call[0]?.skip).toBeLessThanOrEqual(25000);
    }
  });
});

describe("App date sort", () => {
  const unsortedRecalls = [
    makeRecall({
      id: "F-MID",
      recallNumber: "F-MID",
      productDescription: "Mid Product",
      recallInitiationDate: "20230115",
    }),
    makeRecall({
      id: "F-OLD",
      recallNumber: "F-OLD",
      productDescription: "Old Product",
      recallInitiationDate: "20200101",
    }),
    makeRecall({
      id: "F-NEW",
      recallNumber: "F-NEW",
      productDescription: "New Product",
      recallInitiationDate: "20260320",
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetPermissionStatus = () => "denied";
    fetchRecallsMock.mockResolvedValue(makeFetchResult({ recalls: unsortedRecalls, total: 3 }));
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const listedProductNames = () =>
    screen.getAllByRole("button", { name: /view recall/i }).map((el) => el.getAttribute("aria-label"));

  it("defaults to newest-first and shows the date sort control", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("New Product")).toBeInTheDocument());

    const select = screen.getByLabelText("Sort by date") as HTMLSelectElement;
    expect(select.value).toBe("newest");
    expect(listedProductNames()).toEqual([
      "View recall F-NEW: New Product",
      "View recall F-MID: Mid Product",
      "View recall F-OLD: Old Product",
    ]);
    expect(screen.getByText(/Sorted by date, newest first/)).toBeInTheDocument();
  });

  it("reorders listed recalls oldest-first when selected", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Sort by date")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Sort by date"), { target: { value: "oldest" } });

    expect((screen.getByLabelText("Sort by date") as HTMLSelectElement).value).toBe("oldest");
    expect(listedProductNames()).toEqual([
      "View recall F-OLD: Old Product",
      "View recall F-MID: Mid Product",
      "View recall F-NEW: New Product",
    ]);
    expect(screen.getByText(/Sorted by date, oldest first/)).toBeInTheDocument();
  });
});
