sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "accrual/service/WorkflowAPI"
], function(Controller, JSONModel, MessageBox, MessageToast, WorkflowAPI) {
    "use strict";

    return Controller.extend("accrual.controller.RequestPage", {

        onInit: function() {
            var sEmail = this._getEmailFromURL();
            var sMonthEndDate = this._getCurrentMonthEndDate();
            

            var oModel = new JSONModel({
                affiliate: "",
                nameAccrual: "",
                cutoffDate: sMonthEndDate,
                companyCode: "",
                requestedBy: sEmail || "",
                approvedBy: "",
                typeOfRequest: "",
                accrualType: "",
                requestType: "",
                typeOfParty: "",
                csNumber: "",
                selectedItemsCount: 0,
                currency: "",
                items: [this._createEmptyItem()],
                companyCodes: [],
                affiliateToCompanyCodeMap: {},
                companyCodesLoaded: false,
                glAccounts: [],
                glAccountsLoaded: false,
                costCentres: [],
                costCentresLoaded: false,
                internalOrders: [],
                internalOrdersLoaded: false,
                salesOrders: [],
                salesOrdersLoaded: false,
                currencies: [],
                currenciesLoaded: false,
                isEditMode: false,
                instanceId: "",
                dmsDocuments: [],
                dmsFolderId: ""
            });

            this.getView().setModel(oModel);

            var oApprovedByInput = this.byId("approvedByInput");
            if (oApprovedByInput) {
                oApprovedByInput.setEditable(true);
            }

            var sInstanceId = this._getInstanceIdFromURL();
            if (sInstanceId) {
                this._loadInstanceData(sInstanceId);
            }

            var that = this;
            this._hashChangeHandler = function() {
                that._onHashChanged();
            };
            window.addEventListener("hashchange", this._hashChangeHandler);

            this.getView().addEventDelegate({
                onAfterRendering: function() {
                    var oComboBox = that.byId("affiliateSelect");
                    if (oComboBox && !oComboBox._bEventAttached) {
                        oComboBox.attachBrowserEvent("click", function() {
                            that.onAffiliateOpen();
                        });
                        oComboBox._bEventAttached = true;
                    }
                }
            }, this);
        },

        onExit: function() {
            if (this._hashChangeHandler) {
                window.removeEventListener("hashchange", this._hashChangeHandler);
            }
        },

        _onHashChanged: function() {
            var oModel = this.getView().getModel();
            var sNewInstanceId = this._getInstanceIdFromURL();
            var sCurrentInstanceId = oModel.getProperty("/instanceId");

            if (sNewInstanceId && sNewInstanceId !== sCurrentInstanceId) {
                this._loadInstanceData(sNewInstanceId);
            } else if (!sNewInstanceId && sCurrentInstanceId) {
                this._refreshForm();
            }
        },

        // ─── AFFILIATE ───────────────────────────────────────────────────────────────

onAffiliateOpen: function() {
    var oModel = this.getView().getModel();
    if (!oModel.getProperty("/companyCodesLoaded")) {
        this._loadCompanyCodes();
    }
    // Pre-load currencies so the dropdown is ready even before affiliate selection
    if (!oModel.getProperty("/currenciesLoaded")) {
        WorkflowAPI.fetchCurrencies()
            .then(function(currencies) {
                if (currencies && currencies.length > 0) {
                    oModel.setProperty("/currencies", currencies);
                    oModel.setProperty("/currenciesLoaded", true);
                }
            })
            .catch(function(error) {
                console.error("Error pre-loading currencies:", error);
            });
    }
},

        _loadCompanyCodes: function() {
            var that = this;
            var oModel = this.getView().getModel();
            var oAffiliateSelect = this.byId("affiliateSelect");

            if (oAffiliateSelect) oAffiliateSelect.setBusy(true);

            return WorkflowAPI.fetchCompanyCodes()
                .then(function(aResults) {
                    var aFiltered = aResults.filter(function(item) {
                        return item.CompanyCodeName &&
                            item.CompanyCodeName.toUpperCase().startsWith("INFINEUM");
                    }).sort(function(a, b) {
                        return (a.CompanyCodeName || "").toUpperCase()
                            .localeCompare((b.CompanyCodeName || "").toUpperCase());
                    });

                    var oMapping = {};
                    aFiltered.forEach(function(item) {
                        if (item.CompanyCodeName && item.CompanyCode) {
                            oMapping[item.CompanyCodeName] = item.CompanyCode;
                        }
                    });

                    oModel.setProperty("/companyCodes", aFiltered);
                    oModel.setProperty("/affiliateToCompanyCodeMap", oMapping);
                    oModel.setProperty("/companyCodesLoaded", true);
                    MessageToast.show(aFiltered.length + " affiliates loaded successfully");
                })
                .catch(function(error) {
                    MessageBox.error("Failed to load affiliates.\n\n" + error.message);
                })
                .finally(function() {
                    if (oAffiliateSelect) oAffiliateSelect.setBusy(false);
                });
        },

        onAffiliateChange: function(oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var sSelectedAffiliate = oSource.getSelectedKey();
            var oModel = this.getView().getModel();

            oSource.setValueState("None");
            oSource.setValueStateText("");

            if (!sSelectedAffiliate) {
                oModel.setProperty("/companyCode", "");
                oModel.setProperty("/currency", "");
                oModel.setProperty("/costCentres", []);
                oModel.setProperty("/costCentresLoaded", false);
                oModel.setProperty("/internalOrders", []);
                oModel.setProperty("/internalOrdersLoaded", false);
                oModel.setProperty("/currencies", []);
                oModel.setProperty("/currenciesLoaded", false);
                return;
            }

            var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
            var sCompanyCode = oMapping[sSelectedAffiliate] || "";
            oModel.setProperty("/companyCode", sCompanyCode);

            var oCompanyCodeInput = this.byId("companyCodeInput");
            if (oCompanyCodeInput) {
                oCompanyCodeInput.setValueState("None");
                oCompanyCodeInput.setValueStateText("");
            }

            if (sCompanyCode) {
                sap.ui.core.BusyIndicator.show(0);

                if (!oModel.getProperty("/currenciesLoaded")) {
                    WorkflowAPI.fetchCurrencies()
                        .then(function(currencies) {
                            if (currencies && currencies.length > 0) {
                                oModel.setProperty("/currencies", currencies);
                                oModel.setProperty("/currenciesLoaded", true);
                            }
                        })
                        .catch(function(error) {
                            console.error("Error loading currencies:", error);
                        });
                }

                WorkflowAPI.fetchCurrencyFromCostCenter(sCompanyCode)
                    .then(function(currency) {
                        if (currency) {
                            oModel.setProperty("/currency", currency);
                            var aItems = oModel.getProperty("/items");
                            aItems.forEach(function(item, index) {
                                oModel.setProperty("/items/" + index + "/currency", currency);
                            });
                            MessageToast.show("Company Code " + sCompanyCode + " and Currency " + currency + " automatically selected");
                        } else {
                            MessageToast.show("Company Code " + sCompanyCode + " selected. Currency could not be fetched.");
                        }
                        return WorkflowAPI.fetchGLAccounts(sCompanyCode);
                    })
                    .then(function(glAccounts) {
                        if (glAccounts && glAccounts.length > 0) {
                            oModel.setProperty("/glAccounts", glAccounts);
                            oModel.setProperty("/glAccountsLoaded", true);
                        }
                        return WorkflowAPI.fetchCostCentres(sCompanyCode);
                    })
                    .then(function(costCentres) {
                        if (costCentres && costCentres.length > 0) {
                            oModel.setProperty("/costCentres", costCentres);
                            oModel.setProperty("/costCentresLoaded", true);
                        }
                        return WorkflowAPI.fetchInternalOrders(sCompanyCode);
                    })
                    .then(function(internalOrders) {
                        if (internalOrders && internalOrders.length > 0) {
                            oModel.setProperty("/internalOrders", internalOrders);
                            oModel.setProperty("/internalOrdersLoaded", true);
                        }
                    })
                    .catch(function(error) {
                        console.error("Error in affiliate change handler:", error);
                        MessageBox.error("Failed to fetch data for selected affiliate.");
                    })
                    .finally(function() {
                        sap.ui.core.BusyIndicator.hide();
                    });
            }
        },

        // ─── INSTANCE LOAD ───────────────────────────────────────────────────────────

        _loadInstanceData: function(sInstanceId) {
            var that = this;
            var oModel = this.getView().getModel();

            sap.ui.core.BusyIndicator.show(0);

            WorkflowAPI.fetchInstanceData(sInstanceId)
                .then(function(data) {
  console.log("FULL_RAW:" , JSON.stringify(data, null, 2));

                    var formData = null;

                    if (data.form_accrualSubmissionForm_2) {
                        formData = data.form_accrualSubmissionForm_2;
                    } else if (data.startEvent && data.startEvent.accrual) {
                        formData = data.startEvent.accrual;
                    } else if (data.accrual) {
                        formData = data.accrual;
                    } else {
                        throw new Error("Invalid instance data format - cannot find form data");
                    }

                    that._mapInstanceDataToModel(formData, sInstanceId);
                    MessageToast.show("Instance data loaded successfully");
                })
                .catch(function(error) {
                    console.error("Error loading instance data:", error);
                    MessageBox.error("Failed to load instance data.\n\n" + error.message);
                })
                .finally(function() {
                    sap.ui.core.BusyIndicator.hide();
                });
        },

_mapInstanceDataToModel: function(formData, sInstanceId) {

    var that = this;
    var oModel = this.getView().getModel();

    oModel.setProperty("/isEditMode", true);
    oModel.setProperty("/instanceId", sInstanceId);

    var oNested = formData.form_accrualSubmissionForm_2 || {};

    var getValue = function(obj, key1, key2, nestedKey) {
        return obj[key1] || obj[key2] || (nestedKey ? oNested[nestedKey] : "") || "";
    };

    // ── Accrual Type Map ──────────────────────────────────────────────────
    var oAccrualTypeMap = {
        "Commission Accruals": "Commission", "Rebate Accruals": "Rebate",
        "General Ad-Hoc Accruals": "Adhoc",  "Technology Accruals": "Technology",
        "Commission": "Commission", "Rebate": "Rebate",
        "Adhoc": "Adhoc",          "Technology": "Technology"
    };

    // ── FIELD 1: TYPE OF ACCRUAL (Commission / Rebate / Adhoc / Technology) ─
    // Keys: typeOfAccrual, TypeofRequest, typeOfRequest  → all store Accrual Type
    var sAccrualTypeRaw =
        formData["typeOfRequest_1"] || 
        formData["typeOfAccrual"] ||
        formData["TypeofRequest"] ||
        formData["typeOfRequest"] ||
        "";

    var sAccrualTypeKey = oAccrualTypeMap[sAccrualTypeRaw] || sAccrualTypeRaw;

    oModel.setProperty("/accrualType", sAccrualTypeKey);
    oModel.setProperty("/requestType", sAccrualTypeKey);

    // ── FIELD 2: TYPE OF REQUEST (Accrual / Reclass) ──────────────────────
    // Keys: Requesttype, requestType  → ONLY these store Type of Request
    // NEVER fall back to typeOfRequest — that holds Accrual Type value
    var sTypeOfRequestRaw =
        formData["Requesttype"] ||
        formData["requestType"] ||
        "";

    oModel.setProperty("/typeOfRequest", sTypeOfRequestRaw);

    // ── GL Type ───────────────────────────────────────────────────────────
    // PATCH saves as debitGLType, POST saves as DebitGL
    var sGLType =
        formData["debitGLType"] ||
        formData["DebitGLType"] ||
        formData["DebitGL"]     ||
        formData["debitGL"]     ||
        "";

    oModel.setProperty("/glType", sGLType);

    // ── Header Fields ─────────────────────────────────────────────────────
    var sAffiliate   = getValue(formData, "affiliate",   "Affiliate",   "affiliate");
    var sCompanyCode = getValue(formData, "companyCode", "CompanyCode", "companyCode");

    oModel.setProperty("/nameAccrual", getValue(formData, "nameYourAccrual",   "NameYourAccrual",   "nameYourAccrual"));
    oModel.setProperty("/requestedBy", getValue(formData, "requestedBy",       "RequestedBy",       "requestedBy"));
    oModel.setProperty("/approvedBy",  getValue(formData, "approvedBy",        "ApprovedBy",        "approvedBy"));
    oModel.setProperty("/cutoffDate",  getValue(formData, "accrualCutOffDate", "AccrualCutOffDate", "accrualCutOffDate"));
    oModel.setProperty("/typeOfParty", getValue(formData, "typeOfParty",       "Partytype",         "typeOfParty"));
    oModel.setProperty("/companyCode", sCompanyCode);
    oModel.setProperty("/csNumber",    getValue(formData, "csNumber",          "CSNumber",          "csNumber"));

    // ── DMS ───────────────────────────────────────────────────────────────
    var sSupportingDocs =
        getValue(formData, "supportingDocuments",  "SupportingDocuments",  "supportingDocuments") ||
        getValue(formData, "Supporting_Documents", "supporting_Documents", "") ||
        "";

    if (sSupportingDocs && sSupportingDocs.indexOf("spa-res:cmis:folderid:") === 0) {
        var sFolderIdClean = sSupportingDocs.replace("spa-res:cmis:folderid:", "");
        oModel.setProperty("/dmsFolderId",   sFolderIdClean);
        oModel.setProperty("/dmsFolderName", sFolderIdClean);

        WorkflowAPI.fetchDMSFilesFromFolder(sSupportingDocs)
            .then(function(aFiles) {
                var aDocs = (aFiles || []).map(function(doc) {
                    return {
                        objectId:   doc.objectId,
                        fileName:   doc.fileName,
                        fileType:   doc.fileType,
                        fileSize:   doc.fileSize,
                        uploadedOn: doc.uploadedOn
                    };
                });
                oModel.setProperty("/dmsDocuments", aDocs);
            })
            .catch(function(err) {
                console.error("DMS fetch error:", err);
                MessageToast.show("Could not load supporting documents");
            });
    }

    // ── Table / Line Items ────────────────────────────────────────────────
    var accrualTable =
        formData.accrual_Table  ||
        formData.Accrual_Table  ||
        oNested.accrual_Table   ||
        oNested.Accrual_Table   ||
        [];

    if (accrualTable && accrualTable.length > 0) {
        var aItems = accrualTable.map(function(item) {
            return {
                supplier:       getValue(item, "supplierCustomer",      "SupplierCustomer"),
                supplierNumber: "",
                description:    getValue(item, "description",           "Description"),
                currency:       getValue(item, "currency",              "Currency"),
                excludeTax:     getValue(item, "excludeTax",            "ExcludeTax"),
                glAccount:      getValue(item, "gLAccountCode",         "GLAccountCode"),
                creditDebit:    getValue(item, "creditDebitIndicator",  "CreditDebitIndicator"),
                poNumber:       getValue(item, "purchaseOrderNumber",   "PurchaseOrderNumber"),
                poLineItem:     getValue(item, "purchaseOrderLineItem", "PurchaseOrderLineItem"),
                costCentre:     getValue(item, "costCentre",            "CostCentre"),
                internalOrder:  getValue(item, "internalOrder",         "InternalOrder"),
                wbs:            getValue(item, "wBS",                   "WBS"),
                tradingPartner: getValue(item, "tradingPartner",        "TradingPartner"),
                salesOrder:     getValue(item, "salesOrderNumber",      "SalesOrderNumber"),
                salesOrderItem: getValue(item, "salesOrderItemNumber",  "SalesOrderItemNumber"),
                SegmentProduct: getValue(item, "segmentProduct",        "SegmentProduct"),
                segmentShip:    getValue(item, "segmentShiptoParty",    "SegmentShiptoParty"),
                segmentSold:    getValue(item, "segmentSoldtoParty",    "SegmentSoldtoParty"),
                purchaseOrders:     [],
                purchaseOrderItems: [],
                salesOrderItems:    [],
                filteredGLAccounts: [],
                supplierState:    "None", supplierStateText:    "",
                descriptionState: "None", descriptionStateText: "",
                currencyState:    "None", currencyStateText:    "",
                excludeTaxState:  "None", excludeTaxStateText:  "",
                glAccountState:   "None", glAccountStateText:   "",
                creditDebitState: "None", creditDebitStateText: ""
            };
        });

        oModel.setProperty("/items", aItems);
        oModel.setProperty("/currency", getValue(accrualTable[0], "currency", "Currency"));

        this._loadSupplierNumbersAndPOData(
            accrualTable,
            getValue(formData, "typeOfParty", "Partytype", "typeOfParty")
        );
    }

    // ── Load Company Codes → Affiliate → GL / Cost Centre / etc. ─────────
    this._loadCompanyCodes()
        .then(function() {
            var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap") || {};

            var sMatchedKey = "";
            Object.keys(oMapping).forEach(function(key) {
                if (key === sAffiliate || oMapping[key] === sCompanyCode) {
                    sMatchedKey = key;
                }
            });

            oModel.setProperty("/affiliate", sMatchedKey);

            return that._fetchRelatedDataForAffiliate(sCompanyCode);
        })
        .then(function() {
            // ── GL Range filter AFTER affiliate data is loaded ────────────
            if (sCompanyCode && sGLType) {
                var sFrom = sGLType === "Fixed" ? "60000000" : "51000000";
                var sTo   = sGLType === "Fixed" ? "69999999" : "52299999";

                return WorkflowAPI.fetchGLAccountsByRange(sCompanyCode, sFrom, sTo)
                    .then(function(aGL) {
                        oModel.setProperty("/filteredGLGlobal", aGL);
                        var aItems = oModel.getProperty("/items") || [];
                        aItems.forEach(function(item, index) {
                            oModel.setProperty("/items/" + index + "/filteredGLAccounts", aGL);
                        });
                    });
            }
        })
        .then(function() {
            // ── Apply Reclass UI rules after load ─────────────────────────
            var sLoadedType = oModel.getProperty("/typeOfRequest");

            if (sLoadedType === "Reclass") {
                var oAccrualLabel = that.byId("_IDGenLabel6");
                var oAccrualField = that.byId("accrualTypeSelect");
                if (oAccrualLabel) oAccrualLabel.setVisible(false);
                if (oAccrualField) oAccrualField.setVisible(false);
            }
        })
        .catch(function(err) {
            console.error("Error during edit load:", err);
        });
},

_loadSupplierNumbersAndPOData: function(accrualTable, typeOfParty) {
    var that = this;
    var oModel = this.getView().getModel();

    sap.ui.core.BusyIndicator.show(0);

    var aPromises = accrualTable.map(function(item, index) {
        var supplierCustomerName = item.supplierCustomer || item.SupplierCustomer || "";
        var existingPONumber = item.purchaseOrderNumber || item.PurchaseOrderNumber || "";

        if (!supplierCustomerName) return Promise.resolve();

        return WorkflowAPI.searchSupplierByName(supplierCustomerName, typeOfParty)
            .then(function(supplierNumber) {
                if (supplierNumber) {
                    oModel.setProperty("/items/" + index + "/supplierNumber", supplierNumber);

                    if (typeOfParty === "Supplier") {
                        return WorkflowAPI.fetchPurchaseOrders(supplierNumber)
                            .then(function(aPurchaseOrders) {
                                // Filter out POs where PurchasingCompletenessStatus is true
                                var aFiltered = aPurchaseOrders.filter(function(po) {
                                    return po.PurchasingCompletenessStatus !== true &&
                                           po.PurchasingCompletenessStatus !== "true";
                                });

                                oModel.setProperty("/items/" + index + "/purchaseOrders", aFiltered);

                                if (existingPONumber && aFiltered.length > 0) {
                                    var poExists = aFiltered.some(function(po) {
                                        return po.PurchaseOrder === existingPONumber;
                                    });

                                    if (poExists) {
                                        oModel.setProperty("/items/" + index + "/poNumber", existingPONumber);

                                        var existingPOLineItem = item.purchaseOrderLineItem || item.PurchaseOrderLineItem || "";
                                        if (existingPOLineItem) {
                                            return WorkflowAPI.fetchPurchaseOrderItems(existingPONumber)
                                                .then(function(aPOItems) {
                                                    oModel.setProperty("/items/" + index + "/purchaseOrderItems", aPOItems);
                                                    oModel.setProperty("/items/" + index + "/poLineItem", existingPOLineItem);
                                                });
                                        }
                                    } else {
                                        console.warn("Existing PO " + existingPONumber + " is completed/filtered out for item " + index);
                                    }
                                }
                            });
                    }
                }
                return Promise.resolve();
            })
            .catch(function(error) {
                console.error("Error loading supplier/PO data for item " + index, error);
            });
    });

    Promise.all(aPromises)
        .then(function() {
            MessageToast.show("Data loaded successfully");
        })
        .catch(function(error) {
            console.error("Error loading supplier data:", error);
        })
        .finally(function() {
            sap.ui.core.BusyIndicator.hide();
        });
},

        _fetchRelatedDataForAffiliate: function(sCompanyCode) {
            var that = this;
            var oModel = this.getView().getModel();

            if (!sCompanyCode) return Promise.resolve();

            sap.ui.core.BusyIndicator.show(0);

            if (!oModel.getProperty("/currenciesLoaded")) {
                WorkflowAPI.fetchCurrencies()
                    .then(function(currencies) {
                        if (currencies && currencies.length > 0) {
                            oModel.setProperty("/currencies", currencies);
                            oModel.setProperty("/currenciesLoaded", true);
                        }
                    })
                    .catch(function(error) {
                        console.error("Error loading currencies:", error);
                    });
            }

            return WorkflowAPI.fetchGLAccounts(sCompanyCode)
                .then(function(glAccounts) {
                    if (glAccounts && glAccounts.length > 0) {
                        oModel.setProperty("/glAccounts", glAccounts);
                        oModel.setProperty("/glAccountsLoaded", true);
                    }
                    return WorkflowAPI.fetchCostCentres(sCompanyCode);
                })
                .then(function(costCentres) {
                    if (costCentres && costCentres.length > 0) {
                        oModel.setProperty("/costCentres", costCentres);
                        oModel.setProperty("/costCentresLoaded", true);
                    }
                    return WorkflowAPI.fetchInternalOrders(sCompanyCode);
                })
                .then(function(internalOrders) {
                    if (internalOrders && internalOrders.length > 0) {
                        oModel.setProperty("/internalOrders", internalOrders);
                        oModel.setProperty("/internalOrdersLoaded", true);
                    }
                    return WorkflowAPI.fetchSalesOrders();
                })
                .then(function(salesOrders) {
                    if (salesOrders && salesOrders.length > 0) {
                        oModel.setProperty("/salesOrders", salesOrders);
                        oModel.setProperty("/salesOrdersLoaded", true);
                    }
                })
                .finally(function() {
                    sap.ui.core.BusyIndicator.hide();
                });
        },

        // ─── TABLE EVENT HANDLERS ────────────────────────────────────────────────────

        onPONumberChange: function(oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sPurchaseOrder = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sPurchaseOrder) return;

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();

            oModel.setProperty(sPath + "/poLineItem", "");
            oModel.setProperty(sPath + "/description", "");
            oModel.setProperty(sPath + "/excludeTax", "");
            oModel.setProperty(sPath + "/purchaseOrderItems", []);
            oModel.setProperty(sPath + "/excludeTaxState", "None");
            oModel.setProperty(sPath + "/excludeTaxStateText", "");

            oComboBox.setBusy(true);

            WorkflowAPI.fetchPurchaseOrderItems(sPurchaseOrder)
                .then(function(aPOItems) {
                    if (aPOItems && aPOItems.length > 0) {
                        oModel.setProperty(sPath + "/purchaseOrderItems", aPOItems);
                        var firstItem = aPOItems[0];
                        oModel.setProperty(sPath + "/poLineItem", firstItem.PurchaseOrderItem);
                        oModel.setProperty(sPath + "/description", firstItem.PurchaseOrderItemText);
                        oModel.setProperty(sPath + "/excludeTax", firstItem.NetAmount);
                        oModel.setProperty(sPath + "/poNetAmount", firstItem.NetAmount);
                        that._validateExcludeTaxValue(sPath, firstItem.NetAmount);
                        MessageToast.show("PO Line Item details auto-populated");
                    } else {
                        MessageToast.show("No line items found for this PO");
                    }
                })
                .catch(function(error) {
                    console.error("Error loading PO items:", error);
                    MessageToast.show("Failed to load PO items");
                })
                .finally(function() {
                    oComboBox.setBusy(false);
                });
        },

        onPOLineItemChange: function(oEvent) {
            var oComboBox = oEvent.getSource();
            var sSelectedItem = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sSelectedItem) return;

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();
            var aPOItems = oModel.getProperty(sPath + "/purchaseOrderItems");

            if (aPOItems && aPOItems.length > 0) {
                var selectedPOItem = aPOItems.find(function(item) {
                    return item.PurchaseOrderItem === sSelectedItem;
                });

                if (selectedPOItem) {
                    oModel.setProperty(sPath + "/description", selectedPOItem.PurchaseOrderItemText);
                    oModel.setProperty(sPath + "/excludeTax", selectedPOItem.NetAmount);
                    oModel.setProperty(sPath + "/poNetAmount", selectedPOItem.NetAmount);
                    this._validateExcludeTaxValue(sPath, selectedPOItem.NetAmount);
                    MessageToast.show("Description and Amount updated");
                }
            }
        },

onPONumberOpen: function(oEvent) {
    var oComboBox = oEvent.getSource();
    var oContext = oComboBox.getBindingContext();
    var oModel = this.getView().getModel();

    if (!oContext) return;

    var sPath = oContext.getPath();
    var oItem = oModel.getProperty(sPath);
    var sSupplierNumber = oItem.supplierNumber;
    var sTypeOfParty = oModel.getProperty("/typeOfParty");

    if (sTypeOfParty !== "Supplier") return;
    if (!sSupplierNumber) { MessageToast.show("Please select a supplier first"); return; }
    if (oItem.purchaseOrders && oItem.purchaseOrders.length > 0) return;

    oComboBox.setBusy(true);

    WorkflowAPI.fetchPurchaseOrders(sSupplierNumber)
        .then(function(aPurchaseOrders) {
            // Filter out POs where PurchasingCompletenessStatus is true
            var aFiltered = aPurchaseOrders.filter(function(po) {
                return po.PurchasingCompletenessStatus !== true && 
                       po.PurchasingCompletenessStatus !== "true";
            });
            oModel.setProperty(sPath + "/purchaseOrders", aFiltered);
            if (aFiltered.length === 0) MessageToast.show("No open purchase orders found");
        })
        .catch(function(error) {
            console.error("Error loading purchase orders:", error);
            MessageToast.show("Failed to load purchase orders");
        })
        .finally(function() { oComboBox.setBusy(false); });
},

        onCostCentreOpen: function(oEvent) {
            var oModel = this.getView().getModel();
            var sCompanyCode = oModel.getProperty("/companyCode");

            if (!sCompanyCode) { MessageToast.show("Please select an affiliate first"); return; }
            if (oModel.getProperty("/costCentresLoaded")) return;

            var oComboBox = oEvent.getSource();
            oComboBox.setBusy(true);

            WorkflowAPI.fetchCostCentres(sCompanyCode)
                .then(function(costCentres) {
                    if (costCentres && costCentres.length > 0) {
                        oModel.setProperty("/costCentres", costCentres);
                        oModel.setProperty("/costCentresLoaded", true);
                    }
                })
                .catch(function(error) { console.error("Error loading cost centres:", error); })
                .finally(function() { oComboBox.setBusy(false); });
        },

        onCostCentreChange: function(oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sSelectedCostCentre = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext) return;

            var sPath = oContext.getPath();
            var oModel = this.getView().getModel();
            var sFieldName = oComboBox.getBinding("selectedKey") ?
                oComboBox.getBinding("selectedKey").getPath() : "costCentre";

            oModel.setProperty(sPath + "/" + sFieldName + "State", "None");
            oModel.setProperty(sPath + "/" + sFieldName + "StateText", "");

            var iIndex = parseInt(sPath.split("/").pop());

            if (iIndex === 0 && sSelectedCostCentre) {
                oComboBox.setBusy(true);

                WorkflowAPI.fetchApproverEmailFromCostCenter(sSelectedCostCentre)
                    .then(function(approverEmail) {
                        var oApprovedByInput = that.byId("approvedByInput");
                        if (approverEmail) {
                            oModel.setProperty("/approvedBy", approverEmail);
                            MessageToast.show("Approver email auto-populated from Cost Center");
                        } else {
                            if (oApprovedByInput) oApprovedByInput.setEditable(true);
                            MessageToast.show("No approver found for this Cost Center. Please enter manually.");
                        }
                    })
                    .catch(function(error) {
                        console.error("Error loading approver email:", error);
                        var oApprovedByInput = that.byId("approvedByInput");
                        if (oApprovedByInput) oApprovedByInput.setEditable(true);
                        MessageToast.show("Failed to load approver email. Please enter manually.");
                    })
                    .finally(function() { oComboBox.setBusy(false); });

            } else if (iIndex === 0 && !sSelectedCostCentre) {
                var oApprovedByInput = this.byId("approvedByInput");
                if (oApprovedByInput) oApprovedByInput.setEditable(true);
                oModel.setProperty("/approvedBy", "");
            }
        },

        onInternalOrderOpen: function(oEvent) {
            var oModel = this.getView().getModel();
            var sCompanyCode = oModel.getProperty("/companyCode");

            if (!sCompanyCode) { MessageToast.show("Please select an affiliate first"); return; }
            if (oModel.getProperty("/internalOrdersLoaded")) return;

            var oComboBox = oEvent.getSource();
            oComboBox.setBusy(true);

            WorkflowAPI.fetchInternalOrders(sCompanyCode)
                .then(function(internalOrders) {
                    if (internalOrders && internalOrders.length > 0) {
                        oModel.setProperty("/internalOrders", internalOrders);
                        oModel.setProperty("/internalOrdersLoaded", true);
                    }
                })
                .catch(function(error) { console.error("Error loading internal orders:", error); })
                .finally(function() { oComboBox.setBusy(false); });
        },

        onSalesOrderOpen: function(oEvent) {
            var oModel = this.getView().getModel();
            if (oModel.getProperty("/salesOrdersLoaded")) return;

            var oComboBox = oEvent.getSource();
            oComboBox.setBusy(true);

            WorkflowAPI.fetchSalesOrders()
                .then(function(salesOrders) {
                    if (salesOrders && salesOrders.length > 0) {
                        oModel.setProperty("/salesOrders", salesOrders);
                        oModel.setProperty("/salesOrdersLoaded", true);
                    }
                })
                .catch(function(error) { console.error("Error loading sales orders:", error); })
                .finally(function() { oComboBox.setBusy(false); });
        },

        onSalesOrderChange: function(oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sSalesOrder = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sSalesOrder) return;

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();

            oComboBox.setBusy(true);

            WorkflowAPI.fetchSalesOrderItems(sSalesOrder)
                .then(function(aItems) {
                    if (aItems && aItems.length > 0) {
                        oModel.setProperty(sPath + "/salesOrderItem", aItems[0].SalesOrderItem || "");
                        oModel.setProperty(sPath + "/salesOrderItems", aItems);
                    }
                    return WorkflowAPI.fetchSegmentData(sSalesOrder);
                })
                .then(function(segmentData) {
                    if (segmentData) {
                        oModel.setProperty(sPath + "/SegmentProduct", segmentData.Product);
                        oModel.setProperty(sPath + "/segmentShip", segmentData.ShipToParty);
                        oModel.setProperty(sPath + "/segmentSold", segmentData.SoldToParty);
                        MessageToast.show("Sales Order details auto-populated");
                    }
                })
                .catch(function(error) {
                    console.error("Error loading sales order details:", error);
                    MessageToast.show("Failed to load sales order details");
                })
                .finally(function() { oComboBox.setBusy(false); });
        },

        // ─── SUPPLIER SUGGEST ────────────────────────────────────────────────────────

        onSupplierSuggest: function(oEvent) {
            var sSuggestValue = oEvent.getParameter("suggestValue");
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var sTypeOfParty = oModel.getProperty("/typeOfParty");

            if (!sTypeOfParty) { MessageBox.warning("Please select Type of Party first"); return; }
            if (!sSuggestValue || sSuggestValue.length <= 0) return;

            oSource.setBusy(true);

            WorkflowAPI.fetchBusinessPartners(sSuggestValue, sTypeOfParty)
                .then(function(aPartners) {
                    oSource.destroySuggestionItems();
                    aPartners.forEach(function(partner) {
                        oSource.addSuggestionItem(new sap.ui.core.Item({
                            key: partner.key,
                            text: partner.fullText
                        }));
                    });
                })
                .catch(function(error) { console.error("Error in suggestion:", error); })
                .finally(function() { oSource.setBusy(false); });
        },

onSupplierSuggestionSelected: function(oEvent) {
    var that = this;
    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (!oSelectedItem) return;

    var sSelectedText = oSelectedItem.getText();
    var oSource = oEvent.getSource();
    var oContext = oSource.getBindingContext();
    var oModel = this.getView().getModel();

    var parts = sSelectedText.split(" - ");
    var supplierCustomerNumber = parts[0];
    var name = parts[1] || sSelectedText;

    oSource.setValue(name);

    var sTypeOfParty = oModel.getProperty("/typeOfParty");

    if (!oModel.getProperty("/csNumber")) {
        oModel.setProperty("/csNumber", supplierCustomerNumber);
    }

    if (oContext) {
        var sPath = oContext.getPath();
        oModel.setProperty(sPath + "/supplierNumber", supplierCustomerNumber);
        oSource.setBusy(true);
/*
        WorkflowAPI.fetchGLAccountForSupplierCustomer(
            supplierCustomerNumber,
            sTypeOfParty,
            oModel.getProperty("/companyCode")
        )
        .then(function(glAccount) {
            if (glAccount) {
                oModel.setProperty(sPath + "/glAccount", glAccount);
                MessageToast.show("GL Account " + glAccount + " auto-populated");
            }
*/
var pPromise;

        if (sTypeOfParty === "Supplier") {
            pPromise = WorkflowAPI.fetchPurchaseOrders(supplierCustomerNumber);
        } else {
            pPromise = Promise.resolve([]);
        }

        pPromise
            .then(function(aPurchaseOrders) {
                if (sTypeOfParty === "Supplier") {
                    var aFiltered = aPurchaseOrders.filter(function(po) {
                        return po.PurchasingCompletenessStatus !== true &&
                               po.PurchasingCompletenessStatus !== "true";
                    });

                    oModel.setProperty(sPath + "/purchaseOrders", aFiltered);
                }
            })
            .catch(function(error) {
                console.error("Error in supplier selection:", error);
            })
            .finally(function() {
                oSource.setBusy(false);
            });
    }
},

        onGLAccountSuggest: function(oEvent) {
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var aGLAccounts = oModel.getProperty("/glAccounts");

            if (!aGLAccounts || aGLAccounts.length === 0) {
                var sCompanyCode = oModel.getProperty("/companyCode");
                if (!sCompanyCode) { MessageToast.show("Please select an affiliate first"); return; }

                oSource.setBusy(true);

                WorkflowAPI.fetchGLAccounts(sCompanyCode)
                    .then(function(glAccounts) {
                        if (glAccounts && glAccounts.length > 0) {
                            oModel.setProperty("/glAccounts", glAccounts);
                            oModel.setProperty("/glAccountsLoaded", true);
                            oSource.destroySuggestionItems();
                            glAccounts.forEach(function(account) {
                                oSource.addSuggestionItem(new sap.ui.core.Item({
                                    key: account.GLAccount,
                                    text: account.displayText
                                }));
                            });
                        }
                    })
                    .catch(function(error) { console.error("Error loading GL accounts:", error); })
                    .finally(function() { oSource.setBusy(false); });
            }
        },

onCurrencyChange: function(oEvent) {
    var oComboBox = oEvent.getSource();
    var sSelectedCurrency = oComboBox.getSelectedKey();
    var oContext = oComboBox.getBindingContext();
    var oModel = this.getView().getModel();

    if (!oContext) return;

    var sPath = oContext.getPath();
    var iIndex = parseInt(sPath.split("/").pop());

    // Clear validation state first
    oModel.setProperty(sPath + "/currencyState", "None");
    oModel.setProperty(sPath + "/currencyStateText", "");

    if (!sSelectedCurrency) return;

    var aItems = oModel.getProperty("/items");
    var sRow1Currency = aItems[0] ? aItems[0].currency : "";

    // If this is row 1 changing, sync header currency
    if (iIndex === 0) {
        oModel.setProperty("/currency", sSelectedCurrency);
        return;
    }

    // For any other row, validate against row 1's currency
    if (sRow1Currency && sSelectedCurrency !== sRow1Currency) {
        oModel.setProperty(sPath + "/currencyState", "Error");
        oModel.setProperty(sPath + "/currencyStateText", "Currency mismatch");
        MessageBox.error(
            "Currency mismatch detected.\n\n" +
            "Row 1 currency is '" + sRow1Currency + "' but you selected '" + sSelectedCurrency + "'.\n\n" +
            "Please submit a separate request form for line items with a different currency."
        );
    }
},


       //─── Add Credit row

       onAddCreditFromRow: function (oEvent) {
    var oModel = this.getView().getModel();
    var aItems = oModel.getProperty("/items");

    var oContext = oEvent.getSource().getBindingContext();
    if (!oContext) return;

    var sPath = oContext.getPath();
    var iIndex = parseInt(sPath.split("/").pop());

    var oSelectedItem = aItems[iIndex];

    // ✅ Allow only from Debit row
    if (oSelectedItem.creditDebit !== "Debit") {
        sap.m.MessageBox.warning("Credit line can be created only from a Debit row.");
        return;
    }

    // ✅ Copy row
    var oNewItem = JSON.parse(JSON.stringify(oSelectedItem));

    // ✅ Change to Credit
    oNewItem.creditDebit = "Credit";

    // ✅ GL Mapping based on Accrual Type
    var sAccrualType = oModel.getProperty("/accrualType");

    var oGLMap = {
        "Commission": "21000010",
        "Rebate": "21000011",
        "Adhoc": "21000012",
        "Technology": "21000013"
    };

    oNewItem.glAccount = oGLMap[sAccrualType] || "";

    // ✅ Optional: clear validation states
    oNewItem.glAccountState = "None";
    oNewItem.glAccountStateText = "";
    oNewItem.creditDebitState = "None";
    oNewItem.creditDebitStateText = "";

    // ✅ Insert just below the selected row (better UX)
    aItems.splice(iIndex + 1, 0, oNewItem);

    oModel.setProperty("/items", aItems);

    sap.m.MessageToast.show("Credit line created successfully");
},


        //------ Debit GL Account

onGLTypeChangeHeader: function (oEvent) {
    var sType = oEvent.getSource().getSelectedKey();
    var oModel = this.getView().getModel();

    var sCompanyCode = oModel.getProperty("/companyCode");
    var aItems = oModel.getProperty("/items") || [];

    if (!sCompanyCode) {
        sap.m.MessageToast.show("Select Affiliate first");
        return;
    }

    var sFrom = "";
    var sTo = "";

    if (sType === "Fixed") {
        sFrom = "60000000";
        sTo = "69999999";
    } else if (sType === "Variable") {
        sFrom = "51000000";
        sTo = "52299999";
    }

    sap.ui.core.BusyIndicator.show(0);

    WorkflowAPI.fetchGLAccountsByRange(sCompanyCode, sFrom, sTo)
        .then(function (aGL) {

            console.log("GL Result:", aGL);

            //ADD THIS (GLOBAL STORE FOR NEW ROWS)
            oModel.setProperty("/filteredGLGlobal", aGL);

            //UPDATE EACH ROW PROPERLY
            aItems.forEach(function (item, index) {
                var sItemPath = "/items/" + index;

                oModel.setProperty(sItemPath + "/glAccount", "");
                oModel.setProperty(sItemPath + "/filteredGLAccounts", aGL);
            });

        })
        .catch(function (err) {
            console.error("GL fetch error:", err);
            sap.m.MessageToast.show("GL fetch failed");
        })
        .finally(function () {
            sap.ui.core.BusyIndicator.hide();
        });
},


        // ─── FORM FIELD HANDLERS ─────────────────────────────────────────────────────

        onTypeOfPartyChange: function(oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedType = oSelect.getSelectedKey();
            oSelect.setValueState("None");
            oSelect.setValueStateText("");
            if (sSelectedType) MessageToast.show(sSelectedType + " type selected.");
        },

        onRequestTypeChange: function(oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedType = oSelect.getSelectedKey();
            var oModel = this.getView().getModel();

            oSelect.setValueState("None");
            oSelect.setValueStateText("");

            if (sSelectedType === "Reclass") {
                var aItems = oModel.getProperty("/items");

                if (aItems.length > 2) {
                    MessageBox.confirm(
                        "Reclass request allows maximum 2 line items. Current items will be trimmed to 2. Do you want to continue?",
                        {
                            onClose: function(sAction) {
                                if (sAction === MessageBox.Action.OK) {
                                    oModel.setProperty("/items", aItems.slice(0, 2));
                                    MessageToast.show("Line items trimmed to 2 for Reclass request");
                                } else {
                                    oModel.setProperty("/requestType", "Accrual");
                                    oSelect.setSelectedKey("Accrual");
                                }
                            }
                        }
                    );
                } else if (aItems.length === 1) {
                    var sCurrency = oModel.getProperty("/currency");
                    var newItem = this._createEmptyItem();
                    if (sCurrency) newItem.currency = sCurrency;
                    aItems.push(newItem);
                    oModel.setProperty("/items", aItems);
                    MessageToast.show("Reclass selected - 2 line items required");
                } else {
                    MessageToast.show("Reclass selected - maximum 2 line items allowed");
                }
            }
        },

        onFieldChange: function(oEvent) {
            var oSource = oEvent.getSource();
            oSource.setValueState("None");
            oSource.setValueStateText("");
        },

        onTableFieldChange: function(oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            if (!oContext) return;

            var sPath = oContext.getPath();
            var oModel = this.getView().getModel();
            var sFieldName = oSource.getBinding("value") ?
                oSource.getBinding("value").getPath() :
                oSource.getBinding("selectedKey").getPath();

            oModel.setProperty(sPath + "/" + sFieldName + "State", "None");
            oModel.setProperty(sPath + "/" + sFieldName + "StateText", "");
        },

        onExcludeTaxChange: function(oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext();
            if (!oContext) return;
            this._validateExcludeTaxValue(oContext.getPath(), oInput.getValue());
        },

onAddRow: function() {
    var oModel = this.getView().getModel();
    var aItems = oModel.getProperty("/items");
    var sRequestType = oModel.getProperty("/requestType");
    var sRequestType = oModel.getProperty("/typeOfRequest");

    if (sRequestType === "Reclass" && aItems.length >= 2) {
        MessageBox.warning("Reclass request can have a maximum of 2 line items only.");
        return;
    }

    var newItem = this._createEmptyItem();
    var sCurrency = oModel.getProperty("/currency");
    if (sCurrency) newItem.currency = sCurrency;

    var aGL = oModel.getProperty("/filteredGLGlobal");
    if (aGL && aGL.length) {
        newItem.filteredGLAccounts = aGL;
    }

    aItems.push(newItem);
    oModel.setProperty("/items", aItems);

    MessageToast.show("New row added");
},

        onDeleteRow: function(oEvent) {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");

            if (aItems.length === 1) { MessageBox.warning("At least one row is required."); return; }

            var oButton = oEvent.getSource();
            var sPath = oButton.getBindingContext().getPath();
            var iIndex = parseInt(sPath.split("/").pop());

            MessageBox.confirm("Are you sure you want to delete this row?", {
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        aItems.splice(iIndex, 1);
                        oModel.setProperty("/items", aItems);
                        MessageToast.show("Row deleted");
                    }
                }
            });
        },

        onSelectionChange: function() {
            var oTable = this.byId("itemsTable");
            this.getView().getModel().setProperty("/selectedItemsCount", oTable.getSelectedItems().length);
        },

        onDeleteSelected: function() {
            var oTable = this.byId("itemsTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");

            if (aItems.length - aSelectedItems.length < 1) {
                MessageBox.warning("At least one row must remain.");
                return;
            }

            MessageBox.confirm("Delete " + aSelectedItems.length + " row(s)?", {
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aIndices = aSelectedItems.map(function(oItem) {
                            return parseInt(oItem.getBindingContextPath().split("/").pop());
                        }).sort(function(a, b) { return b - a; });

                        aIndices.forEach(function(i) { aItems.splice(i, 1); });

                        oModel.setProperty("/items", aItems);
                        oModel.setProperty("/selectedItemsCount", 0);
                        oTable.removeSelections(true);
                        MessageToast.show(aIndices.length + " row(s) deleted");
                    }
                }
            });
        },

        // ─── SUBMIT / DRAFT ──────────────────────────────────────────────────────────

onSubmit: function() {
    var that = this;

    if (!this._validateHeaderFields() || !this._validateCutoffDate() || !this._validateTableItems()) {
        MessageBox.error("Please fill in all required fields correctly");
        return;
    }

    var oModel = this.getView().getModel();
    oModel.setProperty("/requestType", oModel.getProperty("/accrualType"));


    var oData = oModel.getData();

    oData.typeOfRequest = oModel.getProperty("/typeOfRequest");

    //ADD THIS LINE
    oData.debitGLType = oModel.getProperty("/glType");

    var sInstanceId = this._getInstanceIdFromURL();

    sap.ui.core.BusyIndicator.show(0);

    if (sInstanceId) {
        WorkflowAPI.getTaskInstanceByWorkflowId(sInstanceId, 10, 2000)
            .then(function(taskInstanceId) {
                if (!taskInstanceId) throw new Error("No READY form found for workflow instance: " + sInstanceId);
                return WorkflowAPI.patchTaskInstance(taskInstanceId, that._preparePayloadForPatch(oData, 1));
            })
            .then(function() {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.success("Request submitted successfully!", {
                    onClose: function() { 
                        that._refreshForm(); 
                        that.getOwnerComponent().getRouter().navTo("Dashboard"); 
                    }
                });
            })
            .catch(function(error) {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to submit request:\n\n" + error.message);
            });
    } else {
        var workflowInstanceId = null;

        WorkflowAPI.triggerWorkflow(this._preparePayloadForProcessAutomation(oData, 1))
            .then(function(result) {
                workflowInstanceId = result.id;
                if (!workflowInstanceId) throw new Error("Workflow created but no instance ID returned");
                return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId, 10, 3000);
            })
            .then(function(taskInstanceId) {
                if (!taskInstanceId) throw new Error("No READY form found after workflow creation");
                return WorkflowAPI.patchTaskInstance(taskInstanceId, that._preparePayloadForPatch(oData, 1));
            })
            .then(function() {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.success("Request submitted successfully!", {
                    onClose: function() { 
                        that._refreshForm(); 
                        that.getOwnerComponent().getRouter().navTo("Dashboard"); 
                    }
                });
            })
            .catch(function(error) {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to submit request:\n\n" + error.message);
            });
    }
},


onSaveAsDraft: function() {
    var that = this;

    if (!this._validateHeaderFields() || !this._validateCutoffDate() || !this._validateTableItems()) {
        MessageBox.error("Please fill in all required fields correctly");
        return;
    }

    var oModel = this.getView().getModel();
    oModel.setProperty("/requestType", oModel.getProperty("/accrualType"));


    var oData = oModel.getData();

    oData.typeOfRequest = oModel.getProperty("/typeOfRequest");

    // ADD THIS LINE
    oData.debitGLType = oModel.getProperty("/glType");

    var sInstanceId = this._getInstanceIdFromURL();

    sap.ui.core.BusyIndicator.show(0);

    if (sInstanceId) {
        WorkflowAPI.getTaskInstanceByWorkflowId(sInstanceId, 5, 2000)
            .then(function(taskInstanceId) {
                if (!taskInstanceId) throw new Error("No READY form found for workflow instance: " + sInstanceId);
                return WorkflowAPI.patchTaskInstance(taskInstanceId, that._preparePayloadForPatch(oData, 2));
            })
            .then(function() {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.success("Request saved as draft!", {
                    onClose: function() { 
                        that._refreshForm(); 
                        that.getOwnerComponent().getRouter().navTo("Dashboard"); 
                    }
                });
            })
            .catch(function(error) {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to save draft:\n\n" + error.message);
            });
    } else {
        var workflowInstanceId = null;

        WorkflowAPI.triggerWorkflow(this._preparePayloadForProcessAutomation(oData, 2))
            .then(function(result) {
                workflowInstanceId = result.id;
                if (!workflowInstanceId) throw new Error("Workflow created but no instance ID returned");
                return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId, 10, 3000);
            })
            .then(function(taskInstanceId) {
                if (!taskInstanceId) throw new Error("No READY form found after workflow creation");
                return WorkflowAPI.patchTaskInstance(taskInstanceId, that._preparePayloadForPatch(oData, 2));
            })
            .then(function() {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.success("Request saved as draft!", {
                    onClose: function() { 
                        that._refreshForm(); 
                        that.getOwnerComponent().getRouter().navTo("Dashboard"); 
                    }
                });
            })
            .catch(function(error) {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to save draft:\n\n" + error.message);
            });
    }
},

        // ─── DMS HANDLERS ────────────────────────────────────────────────────────────

// ─── DMS HANDLERS ────────────────────────────────────────────────────────────

onDMSFileSelected: function(oEvent) {

    var oFileUploader = oEvent.getSource();
    var aFiles = oFileUploader.oFileUpload.files;
    var oModel = this.getView().getModel();

    if (!aFiles || aFiles.length === 0) return;

    sap.ui.core.BusyIndicator.show(0);

    var sToken = null;
    var cfg = WorkflowAPI._dmsConfig;
    var ep = cfg.endpoints();

    // ✅ Reuse same folder
    var sFolderName = oModel.getProperty("/dmsFolderName");

    if (!sFolderName) {
        sFolderName = "accrual_" + Date.now();
        oModel.setProperty("/dmsFolderName", sFolderName);
    }

    WorkflowAPI.getDMSToken()
        .then(function(token) {
            sToken = token;

            var sFolderId = oModel.getProperty("/dmsFolderId");

            // ✅ Skip folder creation if already exists
            if (sFolderId) {
                return { skipCreate: true };
            }

            var formData = new FormData();
            formData.append("cmisaction", "createFolder");
            formData.append("propertyId[0]", "cmis:objectTypeId");
            formData.append("propertyValue[0]", "cmis:folder");
            formData.append("propertyId[1]", "cmis:name");
            formData.append("propertyValue[1]", sFolderName);
            formData.append("succinct", "true");

            return fetch(ep.createFolder, {
                method: "POST",
                headers: { "Authorization": "Bearer " + sToken },
                body: formData
            });
        })
        .then(function(r) {

            if (r && r.skipCreate) return r;

            if (!r.ok) throw new Error("Create folder failed: " + r.status);
            return r.json();
        })
        .then(function(data) {

            if (!data.skipCreate) {
                var objectId = data?.succinctProperties?.["cmis:objectId"];
                oModel.setProperty("/dmsFolderId", objectId);
            }

            var uploadUrl = ep.createDocument + "/" + encodeURIComponent(sFolderName);

            // ✅ MULTIPLE FILE UPLOAD WITH UNIQUE NAME
            return Promise.all(
                Array.from(aFiles).map(function(oFile) {

                    // 🔥 FIX: make filename unique
                    var uniqueFileName = Date.now() + "_" + oFile.name;

                    var fd = new FormData();
                    fd.append("cmisaction", "createDocument");
                    fd.append("propertyId[0]", "cmis:name");
                    fd.append("propertyValue[0]", uniqueFileName);
                    fd.append("propertyId[1]", "cmis:objectTypeId");
                    fd.append("propertyValue[1]", "cmis:document");
                    fd.append("filename", uniqueFileName);
                    fd.append("charset", "UTF-8");
                    fd.append("includeAllowableActions", "true");
                    fd.append("succinct", "true");
                    fd.append("media", oFile);

                    return fetch(uploadUrl, {
                        method: "POST",
                        headers: { "Authorization": "Bearer " + sToken },
                        body: fd
                    })
                    .then(function(r) {
                        if (!r.ok) {
                            throw new Error("Upload failed: " + r.status);
                        }
                        return r.json();
                    })
                    .then(function(res) {
                        return {
                            objectId: res?.succinctProperties?.["cmis:objectId"] || "temp_id",
                            fileName: oFile.name, // ✅ show original name in UI
                            fileType: oFile.name.split(".").pop().toUpperCase(),
                            fileSize:
                                oFile.size < 1024 ? oFile.size + " B"
                                : oFile.size < 1048576 ? Math.round(oFile.size / 1024) + " KB"
                                : Math.round(oFile.size / 1048576 * 10) / 10 + " MB",
                            uploadedOn: new Date().toLocaleDateString()
                        };
                    });

                })
            );
        })
        .then(function(aResults) {

            // ✅ APPEND (not overwrite)
            var aDocs = oModel.getProperty("/dmsDocuments") || [];

            aResults.forEach(function(doc) {
                aDocs.push(doc);
            });

            oModel.setProperty("/dmsDocuments", aDocs);

            MessageToast.show(aResults.length + " file(s) uploaded successfully");
        })
        .catch(function(error) {
            console.error("DMS Upload error:", error);
            MessageBox.error("Upload failed: " + error.message);
        })
        .finally(function() {
            sap.ui.core.BusyIndicator.hide();
            oFileUploader.clear();
        });
},

//--Reclass

onTypeOfRequestChange: function (oEvent) {

    var oModel = this.getView().getModel();
    var sType = oEvent.getSource().getSelectedKey();
    var aItems = oModel.getProperty("/items");

    var oAccrualLabel = this.byId("_IDGenLabel6");
    var oAccrualField = this.byId("accrualTypeSelect");

    if (sType === "Reclass") {

        // Hide Accrual Type
        oAccrualLabel.setVisible(false);
        oAccrualField.setVisible(false);

        // Ensure max 2 rows
        if (aItems.length > 2) {
            aItems = aItems.slice(0, 2);
        }

        // Ensure exactly 2 rows
        if (aItems.length === 1) {
            aItems.push(this._createEmptyItem());
        }

        // Set Debit/Credit
        if (aItems.length >= 2) {
            aItems[0].creditDebit = "Debit";
            aItems[1].creditDebit = "Credit";
        }

        oModel.setProperty("/items", aItems);

        sap.m.MessageToast.show("Reclass → Only 2 rows allowed");

    } else {

        // Show Accrual Type
        oAccrualLabel.setVisible(true);
        oAccrualField.setVisible(true);
    }
},

//---dms fetch

_fetchDMSFilesFromFolder: function (sFolderId) {

    var oModel = this.getView().getModel();
    var cfg = WorkflowAPI._dmsConfig;
    var ep = cfg.endpoints();

    if (!sFolderId) return;

    sap.ui.core.BusyIndicator.show(0);

    WorkflowAPI.getDMSToken()
        .then(function (token) {

            // 🔥 CMIS: get children of folder
            var url = ep.browser + "?objectId=" + encodeURIComponent(sFolderId) +
                      "&cmisselector=children&succinct=true";

            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + token
                }
            });
        })
        .then(function (res) {
            if (!res.ok) throw new Error("Fetch files failed: " + res.status);
            return res.json();
        })
        .then(function (data) {

            var aObjects = data?.objects || [];

            var aDocs = aObjects.map(function (obj) {

                var props = obj.object?.succinctProperties || {};

                var name = props["cmis:name"];
                var size = props["cmis:contentStreamLength"];
                var date = props["cmis:creationDate"];
                var objectId = props["cmis:objectId"];

                return {
                    objectId: objectId,
                    fileName: name,
                    fileType: name.split(".").pop().toUpperCase(),
                    fileSize: size
                        ? Math.round(size / 1024) + " KB"
                        : "-",
                    uploadedOn: date
                        ? new Date(date).toLocaleDateString()
                        : "-"
                };
            });

            oModel.setProperty("/dmsDocuments", aDocs);
        })
        .catch(function (err) {
            console.error("DMS fetch error:", err);
            MessageBox.error("Failed to load supporting documents");
        })
        .finally(function () {
            sap.ui.core.BusyIndicator.hide();
        });
},

//--------dms download

onDMSDownload: function (oEvent) {

    var oDoc = oEvent.getSource().getBindingContext().getObject();

    WorkflowAPI.downloadDMSFile(oDoc.objectId)
        .then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = oDoc.fileName;
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(function (err) {
            MessageBox.error("Download failed: " + err.message);
        });
},

//-----------dms delete

onDMSDelete: function (oEvent) {

    var oDoc = oEvent.getSource().getBindingContext().getObject();
    var oModel = this.getView().getModel();

    MessageBox.confirm("Delete " + oDoc.fileName + "?", {
        onClose: function (sAction) {

            if (sAction !== MessageBox.Action.OK) return;

            WorkflowAPI.deleteDMSFile(oDoc.objectId)
                .then(function () {

                    var aDocs = oModel.getProperty("/dmsDocuments") || [];

                    aDocs = aDocs.filter(function (d) {
                        return d.objectId !== oDoc.objectId;
                    });

                    oModel.setProperty("/dmsDocuments", aDocs);

                    MessageToast.show("File deleted");
                })
                .catch(function (err) {
                    MessageBox.error("Delete failed: " + err.message);
                });
        }
    });
},

        // ─── CLEAR / REFRESH ─────────────────────────────────────────────────────────

        onClear: function() {
            var that = this;
            var sEmail = this._getEmailFromURL();

            MessageBox.confirm("Are you sure you want to clear the form?", {
                onClose: function(sAction) {
                    if (sAction !== MessageBox.Action.OK) return;

                    var oModel = that.getView().getModel();
                    var oNewModel = new JSONModel({
                        affiliate: "", nameAccrual: "", cutoffDate: "", companyCode: "",
                        requestedBy: sEmail || "", approvedBy: "", requestType: "", typeOfParty: "",
                        csNumber: "", selectedItemsCount: 0, currency: "",
                        items: [that._createEmptyItem()],
                        companyCodes: oModel.getProperty("/companyCodes") || [],
                        affiliateToCompanyCodeMap: oModel.getProperty("/affiliateToCompanyCodeMap") || {},
                        companyCodesLoaded: oModel.getProperty("/companyCodesLoaded") || false,
                        glAccounts: [], glAccountsLoaded: false,
                        costCentres: [], costCentresLoaded: false,
                        internalOrders: [], internalOrdersLoaded: false,
                        salesOrders: oModel.getProperty("/salesOrders") || [],
                        salesOrdersLoaded: oModel.getProperty("/salesOrdersLoaded") || false,
                        currencies: oModel.getProperty("/currencies") || [],
                        currenciesLoaded: oModel.getProperty("/currenciesLoaded") || false,
                        dmsDocuments: [],
                        dmsFolderId: ""
                    });

                    that.getView().setModel(oNewModel);

                    var oApprovedByInput = that.byId("approvedByInput");
                    if (oApprovedByInput) oApprovedByInput.setEditable(true);

                    that._clearValueStates();
                    that.byId("itemsTable").removeSelections(true);
                    MessageToast.show("Form cleared");
                }
            });
        },

        _refreshForm: function() {
            var sEmail = this._getEmailFromURL();
            var oModel = this.getView().getModel();

            var oNewModel = new JSONModel({
                affiliate: "", nameAccrual: "", cutoffDate: this._getCurrentMonthEndDate(),
                companyCode: "", requestedBy: sEmail || "", approvedBy: "",
                requestType: "", typeOfParty: "", csNumber: "", selectedItemsCount: 0, currency: "",
                items: [this._createEmptyItem()],
                companyCodes: oModel.getProperty("/companyCodes") || [],
                affiliateToCompanyCodeMap: oModel.getProperty("/affiliateToCompanyCodeMap") || {},
                companyCodesLoaded: oModel.getProperty("/companyCodesLoaded") || false,
                glAccounts: [], glAccountsLoaded: false,
                costCentres: [], costCentresLoaded: false,
                internalOrders: [], internalOrdersLoaded: false,
                salesOrders: oModel.getProperty("/salesOrders") || [],
                salesOrdersLoaded: oModel.getProperty("/salesOrdersLoaded") || false,
                currencies: oModel.getProperty("/currencies") || [],
                currenciesLoaded: oModel.getProperty("/currenciesLoaded") || false,
                dmsDocuments: [],
                dmsFolderId: ""
            });

            this.getView().setModel(oNewModel);

            var oApprovedByInput = this.byId("approvedByInput");
            if (oApprovedByInput) oApprovedByInput.setEditable(true);

            this._clearValueStates();

            var oTable = this.byId("itemsTable");
            if (oTable) oTable.removeSelections(true);

            window.scrollTo(0, 0);
        },

        // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

_createEmptyItem: function() {
    return {
        supplier: "",
        supplierNumber: "",
        description: "",
        currency: "",
        excludeTax: "",
        glAccount: "",
        creditDebit: "",
        poNumber: "",
        poLineItem: "",
        costCentre: "",
        internalOrder: "",
        wbs: "",
        tradingPartner: "",
        salesOrder: "",
        salesOrderItem: "",
        SegmentProduct: "",
        segmentShip: "",
        segmentSold: "",
        purchaseOrders: [],
        purchaseOrderItems: [],
        salesOrderItems: [],

        filteredGLAccounts: [],
        
        // validation states
        supplierState: "None",
        supplierStateText: "",
        descriptionState: "None",
        descriptionStateText: "",
        currencyState: "None",
        currencyStateText: "",
        excludeTaxState: "None",
        excludeTaxStateText: "",
        glAccountState: "None",
        glAccountStateText: "",
        creditDebitState: "None",
        creditDebitStateText: ""
    };
},

        _getCurrentMonthEndDate: function() {
            var today = new Date();
            var year = today.getFullYear();
            var month = today.getMonth() + 1;
            var lastDay = new Date(year, month, 0).getDate();
            return "" + year + month.toString().padStart(2, "0") + lastDay.toString().padStart(2, "0");
        },

        _getCurrentDateFormatted: function() {
            var today = new Date();
            return (today.getMonth() + 1).toString().padStart(2, "0") + "-" +
                today.getDate().toString().padStart(2, "0") + "-" +
                today.getFullYear();
        },

        _getEmailFromURL: function() {
            try {
                var oComponentData = this.getOwnerComponent().getComponentData();
                if (oComponentData && oComponentData.startupParameters) {
                    var email = oComponentData.startupParameters.email;
                    if (email && email[0]) return email[0];
                }
                var emailFromQuery = new URLSearchParams(window.location.search).get("email");
                if (emailFromQuery) return emailFromQuery;

                var hash = window.location.hash;
                if (hash) {
                    var emailFromHash = new URLSearchParams(hash.split("?")[1]).get("email");
                    if (emailFromHash) return emailFromHash;
                }
                if (hash && hash.includes("email=")) {
                    var match = hash.match(/email=([^&]*)/);
                    if (match && match[1]) return decodeURIComponent(match[1]);
                }
                return "";
            } catch (error) {
                console.error("Error extracting email from URL:", error);
                return "";
            }
        },

        _getInstanceIdFromURL: function() {
            try {
                var hash = window.location.hash;
                var match1 = hash.match(/#app-preview&\/request\/([a-f0-9\-]+)/i);
                var match2 = hash.match(/#\/request\/([a-f0-9\-]+)/i);
                if (match1 && match1[1]) return match1[1];
                if (match2 && match2[1]) return match2[1];
                return null;
            } catch (error) {
                console.error("Error extracting instance ID from URL:", error);
                return null;
            }
        },

        _validateHeaderFields: function() {
            var bValid = true;
            var aFields = [
                { id: "affiliateSelect", name: "Affiliate" },
                { id: "nameAccrualInput", name: "Name your accrual" },
                { id: "cutoffDatePicker", name: "Accrual cut-off date" },
                { id: "companyCodeInput", name: "Company code" },
                { id: "requestedByInput", name: "Requested by" },
                { id: "approvedByInput", name: "Approved by" },
                { id: "typeOfRequestSelect", name: "Type of Request" },
                { id: "accrualTypeSelect", name: "Type of Accrual" },
                { id: "typeOfPartySelect", name: "Type of Party" }
            ];

var sTypeOfRequest = this.getView().getModel().getProperty("/typeOfRequest");

aFields.forEach(function(field) {

    // 🚨 Skip Type of Accrual validation for Reclass
    if (field.id === "accrualTypeSelect" && sTypeOfRequest === "Reclass") {
        return;
    }

    var oControl = this.byId(field.id);

    if (!oControl) {
        console.error("Control not found:", field.id);
        return;
    }

    var sValue = oControl.getValue ? oControl.getValue() : oControl.getSelectedKey();

    if (!sValue || sValue.trim() === "") {
        oControl.setValueState("Error");
        oControl.setValueStateText(field.name + " is required");
        bValid = false;
    } else {
        oControl.setValueState("None");
        oControl.setValueStateText("");
    }

}, this);

            return bValid;
        },

        _validateTableItems: function() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");
            var bValid = true;

            if (aItems.length === 0) { MessageBox.error("At least one line item is required"); return false; }
            if (oModel.getProperty("/typeOfRequest") === "Reclass" && aItems.length > 2) {
                MessageBox.error("Reclass request can have a maximum of 2 line items only.");
                return false;
            }

            var aRequired = [
                { field: "supplier", label: "Supplier/Customer" },
                { field: "description", label: "Description" },
                { field: "currency", label: "Currency" },
                { field: "excludeTax", label: "Exclude Tax" },
                { field: "glAccount", label: "GL Account Code" },
                { field: "creditDebit", label: "Credit/Debit Indicator" }
            ];

            aItems.forEach(function(item) {
                aRequired.forEach(function(req) {
                    var sValue = item[req.field];
                    if (!sValue || sValue.toString().trim() === "") {
                        item[req.field + "State"] = "Error";
                        item[req.field + "StateText"] = req.label + " is required";
                        bValid = false;
                    } else {
                        item[req.field + "State"] = "None";
                        item[req.field + "StateText"] = "";
                    }
                });

if (item.excludeTax && isNaN(item.excludeTax)) {
                item.excludeTaxState = "Error";
                item.excludeTaxStateText = "Must be a valid number";
                bValid = false;
            } else if (item.excludeTax && !isNaN(item.excludeTax) && parseFloat(item.excludeTax) < 5000) {
                item.excludeTaxState = "Error";
                item.excludeTaxStateText = "Amount less than 5000 is not allowed for accrual";
                bValid = false;
            }
        });

        // Currency mismatch check — all rows must match row 1's currency
        var sRow1Currency = aItems[0] ? aItems[0].currency : "";
        var bCurrencyMismatch = false;
        aItems.forEach(function(item, index) {
            if (index === 0) return;
            if (item.currency && sRow1Currency && item.currency !== sRow1Currency) {
                item.currencyState = "Error";
                item.currencyStateText = "Currency mismatch";
                bCurrencyMismatch = true;
                bValid = false;
            }
        });

        if (bCurrencyMismatch) {
            MessageBox.error(
                "Currency mismatch detected.\n\n" +
                "All line items must use the same currency as row 1 ('" + sRow1Currency + "').\n\n" +
                "Please submit a separate request form for line items with a different currency."
            );
        }

        oModel.setProperty("/items", aItems);
        return bValid;
        },

        _validateCutoffDate: function() {
            var oDatePicker = this.byId("cutoffDatePicker");
            var sDate = oDatePicker.getValue();

            if (!/^\d{8}$/.test(sDate)) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Date must be in format yyyymmdd");
                return false;
            }

            var year = parseInt(sDate.substring(0, 4));
            var month = parseInt(sDate.substring(4, 6));
            var day = parseInt(sDate.substring(6, 8));
            var date = new Date(year, month - 1, day);

            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Invalid date");
                return false;
            }

            var lastDay = new Date(year, month, 0).getDate();
            if (day !== lastDay) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Must be a month-end date. Last day is " + lastDay);
                return false;
            }

            oDatePicker.setValueState("None");
            return true;
        },


        _setRequestTypeFromAccrual: function () {
    var oModel = this.getView().getModel();
    var sAccrualType = oModel.getProperty("/accrualType");

    if (sAccrualType) {
        oModel.setProperty("/requestType", sAccrualType);
    }
},

_validateExcludeTaxValue: function (sPath, sValue) {
    var oModel = this.getView().getModel();

    // Reset state
    oModel.setProperty(sPath + "/excludeTaxState", "None");
    oModel.setProperty(sPath + "/excludeTaxStateText", "");

    if (!sValue || sValue.toString().trim() === "") return;

    var fValue = parseFloat(sValue);
    var fPONetAmount = parseFloat(oModel.getProperty(sPath + "/poNetAmount"));

    // ❌ Not a number
    if (isNaN(fValue)) {
        oModel.setProperty(sPath + "/excludeTaxState", "Error");
        oModel.setProperty(sPath + "/excludeTaxStateText", "Must be a valid number");
        return;
    }

    // ❌ Less than 5000
    if (fValue < 5000) {
        oModel.setProperty(sPath + "/excludeTaxState", "Error");
        oModel.setProperty(
            sPath + "/excludeTaxStateText",
            "Amount less than 5000 is not allowed for accrual"
        );
        return;
    }

    // ❌ NEW VALIDATION → Exceeding PO Net Amount
    if (!isNaN(fPONetAmount) && fValue > fPONetAmount) {
        oModel.setProperty(sPath + "/excludeTaxState", "Error");
        oModel.setProperty(
            sPath + "/excludeTaxStateText",
            "Amount exceeds Purchase Order Net Amount (" + fPONetAmount + ")"
        );

        sap.m.MessageBox.error(
            "Entered amount (" + fValue + ") is exceeding the Purchase Order Net Amount (" + fPONetAmount + ")."
        );
        return;
    }

    // ✅ Valid
    oModel.setProperty(sPath + "/excludeTaxState", "None");
    oModel.setProperty(sPath + "/excludeTaxStateText", "");
},

        _clearValueStates: function() {
            ["affiliateSelect", "nameAccrualInput", "cutoffDatePicker", "companyCodeInput",
             "requestedByInput", "approvedByInput", "requestTypeSelect", "typeOfPartySelect"
            ].forEach(function(sId) {
                var oControl = this.byId(sId);
                if (oControl) { oControl.setValueState("None"); oControl.setValueStateText(""); }
            }, this);
        },

        _calculateFinanceApproval: function(oData) {
            var sCompanyCode = (oData.companyCode || "").toUpperCase().trim();
            if (sCompanyCode === "CNC1" || sCompanyCode === "CNC2") return true;
            return (oData.items || []).some(function(item) {
                var fAmount = parseFloat(item.excludeTax);
                return !isNaN(fAmount) && fAmount > 25000;
            });
        },

_preparePayloadForPatch: function(oData, iStatus) {
    return {
        status: "COMPLETED",
        decision: "submit",
        context: {
            affiliate: oData.affiliate || "",
            companyCode: oData.companyCode || "",
            nameYourAccrual: oData.nameAccrual || "",
            requestedBy: oData.requestedBy || "",
            approvedBy: oData.approvedBy || "",
            accrualCutOffDate: oData.cutoffDate || "",

            // ✅ TYPE OF ACCRUAL — match POST field name exactly
            TypeofRequest: oData.accrualType || "",
            typeOfRequest: oData.accrualType || "",   // extra safety
            typeOfAccrual: oData.accrualType || "",   // keep old one too

            // ✅ TYPE OF REQUEST (Accrual / Reclass) — keep consistent
            Requesttype:       oData.typeOfRequest || "",
            requestType:       oData.typeOfRequest || "",
            typeOfRequest_1:  oData.typeOfRequest  || "",

            typeOfParty: oData.typeOfParty || "",
            debitGLType: oData.debitGLType || "",
            status: iStatus.toString(),
            financeApproval: this._calculateFinanceApproval(oData),

            supportingDocuments: oData.dmsFolderId
                ? "spa-res:cmis:folderid:" + oData.dmsFolderId
                : "",

            Lastupdateddate: this._getCurrentDateFormatted(),

            accrual_Table: oData.items.map(function(item, index) {
                var cdIndicator = item.creditDebit === "Debit" ? "D" :
                                  item.creditDebit === "Credit" ? "C" : "";
                return {
                    itemNumber: (index + 1).toString(),
                    supplierCustomer: item.supplier || "",
                    purchaseOrderNumber: item.poNumber || "",
                    purchaseOrderLineItem: item.poLineItem || "",
                    description: item.description || "",
                    currency: item.currency || "",
                    excludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                    gLAccountCode: item.glAccount || "",
                    creditDebitIndicator: item.creditDebit || "",
                    cDIndicator: cdIndicator,
                    costCentre: item.costCentre || "",
                    internalOrder: item.internalOrder || "",
                    wBS: item.wbs || "",
                    tradingPartner: item.tradingPartner || "",
                    salesOrderNumber: item.salesOrder || "",
                    salesOrderItemNumber: item.salesOrderItem || "",
                    segmentProduct: item.SegmentProduct || "",
                    segmentShiptoParty: item.segmentShip || "",
                    segmentSoldtoParty: item.segmentSold || ""
                };
            })
        }
    };
},

_preparePayloadForProcessAutomation: function(oData, iStatus) {
    var bFinanceApproval = this._calculateFinanceApproval(oData);
    var sSupportingDocs = oData.dmsFolderId
        ? "spa-res:cmis:folderid:" + oData.dmsFolderId
        : "";

    return {
        definitionId: WorkflowAPI._processAutomationConfig.definitionId,
        context: {
            accrual: {
                Affiliate: oData.affiliate || "",
                CompanyCode: oData.companyCode || "",
                NameYourAccrual: oData.nameAccrual || "",
                RequestedBy: oData.requestedBy || "",
                ApprovedBy: oData.approvedBy || "",
                AccrualCutOffDate: oData.cutoffDate || "",

                // ✅ TYPE OF ACCRUAL (Commission / Rebate / Adhoc / Technology)
                TypeofRequest: oData.accrualType || "",
                typeOfRequest: oData.accrualType || "",  // extra safety

                // ✅ TYPE OF REQUEST (Accrual / Reclass) — clearly separate
                Requesttype: oData.typeOfRequest || "",
                requestType: oData.typeOfRequest || "",
                typeOfRequest_1:  oData.typeOfRequest  || "",

                Partytype: oData.typeOfParty || "",
                CSNumber: oData.csNumber || "",
                DebitGL: oData.debitGLType || "",
                Createddate: this._getCurrentDateFormatted(),
                Status: iStatus.toString(),
                financeApproval: bFinanceApproval,
                Supporting_Documents: sSupportingDocs,

                Accrual_Table: oData.items.map(function(item, index) {
                    var cdIndicator = item.creditDebit === "Debit" ? "D" :
                                      item.creditDebit === "Credit" ? "C" : "";
                    return {
                        ItemnoAcc: (index + 1).toString(),
                        SupplierCustomer: item.supplier || "",
                        Description: item.description || "",
                        Currency: item.currency || "",
                        ExcludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                        GLAccountCode: item.glAccount || "",
                        CreditDebitIndicator: item.creditDebit || "",
                        Cdindicator: cdIndicator,
                        PurchaseOrderNumber: item.poNumber || "",
                        PurchaseOrderLineItem: item.poLineItem || "",
                        CostCentre: item.costCentre || "",
                        InternalOrder: item.internalOrder || "",
                        WBS: item.wbs || "",
                        TradingPartner: item.tradingPartner || "",
                        SalesOrderNumber: item.salesOrder || "",
                        SalesOrderItemNumber: item.salesOrderItem || "",
                        SegmentProduct: item.SegmentProduct || "",
                        SegmentShiptoParty: item.segmentShip || "",
                        SegmentSoldtoParty: item.segmentSold || ""
                    };
                })
            }
        }
    };
},
    });
});