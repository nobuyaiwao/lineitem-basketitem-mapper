const lineItemsInput = document.getElementById("lineitems-json");
const riskDataInput = document.getElementById("riskdata-json");
const statusText = document.getElementById("status-text");
const directionText = document.getElementById("direction-text");
const messageOutput = document.getElementById("message-output");

const lineToRiskMap = {
  id: "itemID",
  description: "productTitle",
  amountIncludingTax: "amountPerItem",
  quantity: "quantity",
  sku: "sku",
  upc: "upc",
  brand: "brand",
  manufacturer: "manufacturer",
  itemCategory: "category",
  color: "color",
  size: "size",
  receiverEmail: "receiverEmail"
};

const notMappedLineFields = [
  "amountExcludingTax",
  "taxAmount",
  "taxPercentage",
  "taxCategory",
  "productUrl",
  "imageUrl",
  "marketplaceSellerId"
];

let isProgrammaticUpdate = false;
let debounceTimer = null;

function parseJson(value) {
  if (!value.trim()) return null;
  return JSON.parse(value);
}

function prettyPrint(obj) {
  return JSON.stringify(obj, null, 2);
}

function extractLineItems(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.lineItems)) return input.lineItems;
  throw new Error("Input must be an array or an object with a lineItems array.");
}

function getAmountCurrency(input) {
  return input?.amount?.currency || input?.currency || null;
}

function lineItemsToAdditionalData(input) {
  const lineItems = extractLineItems(input);
  const currency = getAmountCurrency(input);
  const additionalData = {};
  const warnings = [];

  lineItems.forEach((item, index) => {
    const itemNumber = index + 1;
    const prefix = `riskdata.basket.item${itemNumber}`;

    for (const [lineKey, riskKey] of Object.entries(lineToRiskMap)) {
      if (item[lineKey] !== undefined && item[lineKey] !== null) {
        additionalData[`${prefix}.${riskKey}`] = String(item[lineKey]);
      }
    }

    if (currency) {
      additionalData[`${prefix}.currency`] = String(currency);
    } else {
      warnings.push(
        `item${itemNumber}: currency is not available. Expected amount.currency or top-level currency.`
      );
    }

    notMappedLineFields.forEach((field) => {
      if (item[field] !== undefined && item[field] !== null) {
        warnings.push(
          `item${itemNumber}: lineItems.${field} is not mapped to riskdata.basket.item${itemNumber}.*`
        );
      }
    });
  });

  return {
    result: {
      additionalData
    },
    warnings
  };
}

function extractAdditionalData(input) {
  if (input?.additionalData) return input.additionalData;
  throw new Error("Input must be an object with additionalData.");
}

function additionalDataToBasket(additionalData) {
  const basket = {};

  Object.entries(additionalData).forEach(([key, value]) => {
    const match = key.match(/^riskdata\.basket\.(item\d+)\.(.+)$/);

    if (!match) return;

    const [, itemKey, fieldName] = match;

    if (!basket[itemKey]) {
      basket[itemKey] = {};
    }

    basket[itemKey][fieldName] = value;
  });

  return basket;
}

function additionalDataToLineItems(input) {
  const additionalData = extractAdditionalData(input);
  const basket = additionalDataToBasket(additionalData);

  const reverseMap = Object.fromEntries(
    Object.entries(lineToRiskMap).map(([lineKey, riskKey]) => [riskKey, lineKey])
  );

  const lineItems = [];
  const warnings = [];
  let detectedCurrency = null;

  const itemKeys = Object.keys(basket).sort((a, b) => {
    return Number(a.replace("item", "")) - Number(b.replace("item", ""));
  });

  if (itemKeys.length === 0) {
    throw new Error("No riskdata.basket.item{N}.* fields were found in additionalData.");
  }

  itemKeys.forEach((itemKey) => {
    const riskItem = basket[itemKey];
    const lineItem = {};

    Object.entries(riskItem).forEach(([riskKey, value]) => {
      if (riskKey === "currency") {
        detectedCurrency = value;
        return;
      }

      const lineKey = reverseMap[riskKey];

      if (!lineKey) {
        warnings.push(`${itemKey}: riskdata.basket.${itemKey}.${riskKey} is not mapped to lineItems.`);
        return;
      }

      if (lineKey === "quantity" || lineKey === "amountIncludingTax") {
        lineItem[lineKey] = Number(value);
      } else {
        lineItem[lineKey] = value;
      }
    });

    lineItems.push(lineItem);
  });

  const result = {
    lineItems
  };

  if (detectedCurrency) {
    result.amount = {
      currency: detectedCurrency,
      value: 0
    };

    warnings.push(
      "currency was mapped to amount.currency. amount.value is set to 0 as a placeholder."
    );
  }

  warnings.push(
    "The following lineItems fields cannot be restored from additionalData: amountExcludingTax, taxAmount, taxPercentage, taxCategory, productUrl, imageUrl, marketplaceSellerId."
  );

  return {
    result,
    warnings
  };
}

function updateMessage(status, warnings = []) {
  statusText.textContent = status;

  if (!warnings.length) {
    messageOutput.textContent = "No warnings.";
    return;
  }

  messageOutput.textContent = warnings.map((warning) => `- ${warning}`).join("\n");
}

function convertFromLineItems() {
  const input = parseJson(lineItemsInput.value);

  if (!input) {
    riskDataInput.value = "";
    directionText.textContent = "Auto";
    updateMessage("Ready.");
    return;
  }

  const { result, warnings } = lineItemsToAdditionalData(input);

  isProgrammaticUpdate = true;
  riskDataInput.value = prettyPrint(result);
  isProgrammaticUpdate = false;

  directionText.textContent = "lineItems → additionalData";
  updateMessage("Converted successfully.", warnings);
}

function convertFromAdditionalData() {
  const input = parseJson(riskDataInput.value);

  if (!input) {
    lineItemsInput.value = "";
    directionText.textContent = "Auto";
    updateMessage("Ready.");
    return;
  }

  const { result, warnings } = additionalDataToLineItems(input);

  isProgrammaticUpdate = true;
  lineItemsInput.value = prettyPrint(result);
  isProgrammaticUpdate = false;

  directionText.textContent = "additionalData → lineItems";
  updateMessage("Converted successfully.", warnings);
}

function debounce(fn) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, 250);
}

lineItemsInput.addEventListener("input", () => {
  if (isProgrammaticUpdate) return;

  debounce(() => {
    try {
      convertFromLineItems();
    } catch (error) {
      statusText.textContent = "Invalid lineItems JSON.";
      directionText.textContent = "lineItems → additionalData";
      messageOutput.textContent = error.message;
    }
  });
});

riskDataInput.addEventListener("input", () => {
  if (isProgrammaticUpdate) return;

  debounce(() => {
    try {
      convertFromAdditionalData();
    } catch (error) {
      statusText.textContent = "Invalid additionalData JSON.";
      directionText.textContent = "additionalData → lineItems";
      messageOutput.textContent = error.message;
    }
  });
});

document.getElementById("copy-lineitems").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lineItemsInput.value);
  updateMessage("Copied lineItems JSON.");
});

document.getElementById("copy-riskdata").addEventListener("click", async () => {
  await navigator.clipboard.writeText(riskDataInput.value);
  updateMessage("Copied additionalData JSON.");
});

document.getElementById("clear-lineitems").addEventListener("click", () => {
  lineItemsInput.value = "";
  updateMessage("Cleared lineItems.");
});

document.getElementById("clear-riskdata").addEventListener("click", () => {
  riskDataInput.value = "";
  updateMessage("Cleared additionalData.");
});
