sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "accrual/service/WorkflowAPI"
], function (Controller, JSONModel, MessageBox, MessageToast, WorkflowAPI) {
    "use strict";

    return Controller.extend("accrual.controller.CopyFunction", {

        onInit: function () {
            var sEmail = this._getEmailFromURL();
            var sMonthEndDate = this._getCurrentMonthEndDate();

            var oModel = new JSONModel({
                affiliate: "",
                nameAccrual: "",
                cutoffDate: sMonthEndDate,
                companyCode: "",
                requestedBy: sEmail || "",
                approvedBy: "",
                approvedByEmails: [],
                accrualType: "",
                typeOfParty: "",
                csNumber: "",
                selectedItemsCount: 0,
                currency: "",
                items: [
                    this._createEmptyItem()
                ],
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
                dmsFolderId: "",
                totalExcludeTax: 0,
                totalUSD: 0,
                wbsElements: [],
                wbsLoaded: false,
                costCenterOwner: "",
                costCenterOwnerEmails: []
            });

            this.getView().setModel(oModel);

            var oModel = this.getView().getModel();

            oModel.attachPropertyChange(function (oEvent) {

                var sPath = oEvent.getParameter("path");

                if (sPath && (
                    sPath.includes("excludeTax") ||
                    sPath.includes("items") ||
                    sPath.includes("currency")
                )) {
                    this._convertToUSD();
                }

            }.bind(this));

            // Check for instance ID in URL on initial load
            var sInstanceId = this._getInstanceIdFromURL();
            if (sInstanceId) {
                this._loadInstanceData(sInstanceId);
            }

            // Add hash change listener to detect URL changes
            var that = this;
            this._hashChangeHandler = function () {
                that._onHashChanged();
            };
            window.addEventListener("hashchange", this._hashChangeHandler);

            var that = this;
            this.getView().addEventDelegate({
                onAfterRendering: function () {
                    var oComboBox = that.byId("affiliateSelect");
                    if (oComboBox && !oComboBox._bEventAttached) {
                        oComboBox.attachBrowserEvent("click", function () {
                            that.onAffiliateOpen();
                        });
                        oComboBox._bEventAttached = true;
                    }
                }
            }, this);
        },
        _onHashChanged: function () {
            console.log("=== Hash Changed Event ===");
            console.log("Full URL:", window.location.href);
            console.log("Hash:", window.location.hash);

            var oModel = this.getView().getModel();
            var sNewInstanceId = this._getInstanceIdFromURL();
            var sCurrentInstanceId = oModel.getProperty("/instanceId");

            console.log("Current instance ID in model:", sCurrentInstanceId);
            console.log("New instance ID from URL:", sNewInstanceId);

            // If instance ID changed, reload data
            if (sNewInstanceId && sNewInstanceId !== sCurrentInstanceId) {
                console.log("✓ Instance ID changed, reloading data...");
                this._loadInstanceData(sNewInstanceId);
            } else if (!sNewInstanceId && sCurrentInstanceId) {
                // URL changed to no instance ID (navigated to new request)
                console.log("✓ Navigated to new request, clearing form...");
                this._refreshForm();
            } else {
                console.log("✗ No action needed - instance ID unchanged");
            }
        },
        onAffiliateOpen: function () {
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/companyCodesLoaded");

            if (!bLoaded) {
                this._fetchCompanyCodes();
            }
        },

        onAccrualTypeChange: function () {
            this._applyDebitGLLogic();
        },

        _fetchCompanyCodes: function () {
            var that = this;
            var oModel = this.getView().getModel();
            var oAffiliateSelect = this.byId("affiliateSelect");

            if (oAffiliateSelect) {
                oAffiliateSelect.setBusy(true);
            }

            return WorkflowAPI.fetchCompanyCodes()
                .then(function (aCompanyCodes) {

                    //Filter: remove nulls + restrict "Infineum USA Inc"
                    var aFilteredCompanyCodes = aCompanyCodes.filter(function (item) {
                        return item.CompanyCodeName &&
                            item.CompanyCodeName !== "Infineum USA Inc";
                    });

                    aFilteredCompanyCodes.sort(function (a, b) {
                        return (a.CompanyCodeName || "")
                            .localeCompare(b.CompanyCodeName || "");
                    });

                    var oMapping = {};
                    aFilteredCompanyCodes.forEach(function (item) {
                        if (item.CompanyCodeName && item.CompanyCode) {
                            oMapping[item.CompanyCodeName] = item.CompanyCode;
                        }
                    });

                    oModel.setProperty("/companyCodes", aFilteredCompanyCodes);
                    oModel.setProperty("/affiliateToCompanyCodeMap", oMapping);
                    oModel.setProperty("/companyCodesLoaded", true);
                })
                .finally(function () {
                    if (oAffiliateSelect) {
                        oAffiliateSelect.setBusy(false);
                    }
                });
        },

        //----Debit GL------------------------------------

        _applyDebitGLLogic: function () {

            var oModel = this.getView().getModel();

            var sAccrualType = oModel.getProperty("/requestType"); // Copy page
            var sCompanyCode = oModel.getProperty("/companyCode");
            var aItems = oModel.getProperty("/items") || [];

            if (!sAccrualType || !sCompanyCode) return;

            sap.ui.core.BusyIndicator.show(0);

            var pPromise;

            // ===== COMMISSION =====
            if (sAccrualType === "Commission") {

                pPromise = Promise.resolve([
                    { GLAccount: "70400005", displayText: "70400005 - Corporate Charge Revenue-Miscellaneous" },
                    { GLAccount: "70400011", displayText: "70400011 - Corporate Charge Expense-Miscellaneous" },
                    { GLAccount: "51100001", displayText: "51100001 - Marketing-Commissions" }
                ]);
            }

            // ===== REBATE =====
            else if (sAccrualType === "Rebate") {

                pPromise = Promise.resolve([
                    { GLAccount: "41000000", displayText: "41000000 - Sales Revenue Accruals Non-Group-Goods" },
                    { GLAccount: "41100000", displayText: "41100000 - Sales Revenue Accruals Intercompany-Goods" }
                ]);
            }

            // ===== ADHOC =====
            else if (sAccrualType === "Adhoc") {

                pPromise = WorkflowAPI.fetchGLAccountsByRange(
                    sCompanyCode,
                    "51000000",
                    "69999999"
                );
            }

            // ===== TECHNOLOGY =====
            else if (sAccrualType === "Technology") {

                pPromise = Promise.resolve([
                    { GLAccount: "63600001", displayText: "63600001 - Technology-Research & Development Consulting" },
                    { GLAccount: "63600005", displayText: "63600005 - Technology-Bench Testing" },
                    { GLAccount: "63600004", displayText: "63600004 - Technology-Engine Testing" },
                    { GLAccount: "63600007", displayText: "63600007 - Technology-Other Testing" },
                    { GLAccount: "63600008", displayText: "63600008 - Technology-Bill-Out" },
                    { GLAccount: "63600006", displayText: "63600006 - Technology-Field Testing" },
                    { GLAccount: "40000002", displayText: "40000002 - Sales Revenue Non-Group-Tech Fund" },
                    { GLAccount: "51100000", displayText: "51100000 - Marketing-Tech Fund" },
                    { GLAccount: "14100004", displayText: "14100004 - Deferred Intercompany-Other Accrual" },
                    { GLAccount: "42000002", displayText: "42000002 - Other Revenue Non-Group-Co Fund" },
                    { GLAccount: "12800000", displayText: "12800000 - Other Current Receivables-Third Party" },
                    { GLAccount: "50800000", displayText: "50800000 - Cost of Goods Sold Non-Group-Tech Fund & CoFund" }
                ]);
            }

            pPromise
                .then(function (aGL) {

                    // store global list
                    oModel.setProperty("/filteredGLGlobal", aGL);

                    aItems.forEach(function (item, index) {

                        var sPath = "/items/" + index;
                        var sExistingGL = item.glAccount;

                        var aFinalGL = aGL;

                        //ADD MISSING GL INTO DROPDOWN (CRITICAL FIX)
                        if (sExistingGL) {

                            sExistingGL = sExistingGL.toString().trim();

                            var bExists = aGL.some(function (g) {
                                return g.GLAccount === sExistingGL;
                            });

                            if (!bExists) {
                                aFinalGL = aGL.concat([{
                                    GLAccount: sExistingGL,
                                    displayText: sExistingGL + " (Existing)"
                                }]);
                            }
                        }

                        //APPLY FINAL LIST
                        oModel.setProperty(sPath + "/filteredGLAccounts", aFinalGL);
                    });

                })
                .catch(function (err) {
                    console.error("GL Logic Error:", err);
                })
                .finally(function () {
                    sap.ui.core.BusyIndicator.hide();
                });
        },


        onExit: function () {
            // Remove hash change listener when view is destroyed
            if (this._hashChangeHandler) {
                window.removeEventListener("hashchange", this._hashChangeHandler);
            }
        },


        _calculateTotalAmount: function () {

            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];

            var total = 0;

            aItems.forEach(function (item) {
                var val = parseFloat(item.excludeTax);
                if (!isNaN(val)) {
                    total += val;
                }
            });

            total = parseFloat(total.toFixed(2));

            oModel.setProperty("/totalExcludeTax", total);

            return total;
        },


        _convertToUSD: function () {

            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var currency = aItems[0] ? aItems[0].currency : "";

            var total = this._calculateTotalAmount();

            if (!currency || !total) {
                oModel.setProperty("/totalUSD", 0.00);
                this._updateApprovedBy();
                return Promise.resolve(0);
            }

            if (currency === "USD") {
                var rounded = parseFloat(total.toFixed(2));
                oModel.setProperty("/totalUSD", rounded);
                this._updateApprovedBy();
                return Promise.resolve(rounded);
            }

            return WorkflowAPI.fetchExchangeRate(currency, "USD")
                .then((res) => {

                    if (!res || !res.rate) {
                        throw new Error("Exchange rate not found");
                    }

                    var totalUSD;

                    if (res.quotation === "I") {
                        totalUSD = total / res.rate;
                    } else {
                        totalUSD = total * res.rate;
                    }

                    totalUSD = parseFloat(totalUSD.toFixed(2));

                    oModel.setProperty("/totalUSD", totalUSD);

                    this._updateApprovedBy();

                    return totalUSD;
                })
                .catch((err) => {
                    console.error("Conversion error:", err);
                    oModel.setProperty("/totalUSD", 0.00);
                    this._updateApprovedBy();
                });
        },


        _getFinanceManagerEmail: function (companyCode) {

            var map = {

                "BRC1": ["Jorge.Nascimento@Infineum.com"],
                "USC1": ["Sophie.Paterson@Infineum.com"],

                "DEC1": ["Gordana.Sedic@Infineum.com"],
                "DEC2": ["Gordana.Sedic@Infineum.com"],

                "NLC1": ["Helen.Summerville@Infineum.com"],
                "NLC2": ["Helen.Summerville@Infineum.com"],
                "GBC1": ["Helen.Summerville@Infineum.com"],
                "GBC2": ["Helen.Summerville@Infineum.com"],
                "FRC1": ["Helen.Summerville@Infineum.com"],
                "ESC1": ["Helen.Summerville@Infineum.com"],

                "ITC1": ["Stefania.Torselli@Infineum.com"],

                "INC1": ["Anagha.Venkitaraman@Infineum.com"],

                // UPDATED
                "SGC1": [
                    "KiatLi.Lee@Infineum.com",
                    "Valerie.Ong@Infineum.com"
                ],

                "JPC1": [
                    "KiatLi.Lee@Infineum.com",
                    "Valerie.Ong@Infineum.com"
                ],

                "KRC1": [
                    "KiatLi.Lee@Infineum.com",
                    "Valerie.Ong@Infineum.com"
                ],

                "CNC1": ["Xuan.Li@Infineum.com"],
                "CNC2": ["Xuan.Li@Infineum.com"]
            };

            return map[companyCode] || [];
        },


        _getThreshold: function (companyCode) {

            var small = ["DEC2", "ESC1", "GBC2", "INC1", "JPC1", "KRC1", "USC2", "CNC1", "CNC2"];
            var medium = ["BRC1", "GBC1", "NLC1", "NLC2"];
            var large = ["DEC1", "FRC1", "ITC1", "SGC1", "USC1"];

            if (small.includes(companyCode)) return 5000;
            if (medium.includes(companyCode)) return 25000;
            if (large.includes(companyCode)) return 50000;

            return 5000;
        },


        _updateApprovedBy: function () {

            var oModel = this.getView().getModel();

            var totalUSD = parseFloat(
                oModel.getProperty("/totalUSD")
            ) || 0;

            var companyCode = oModel.getProperty("/companyCode");

            if (!companyCode) {

                oModel.setProperty("/approvedBy", "");
                oModel.setProperty("/approvedByEmails", []);

                return;
            }

            var threshold = this._getThreshold(companyCode);

            // BELOW THRESHOLD
            if (totalUSD < threshold) {

                oModel.setProperty("/approvedBy", "");
                oModel.setProperty("/approvedByEmails", []);

                return;
            }

            // ABOVE / EQUAL THRESHOLD
            var aEmails = this._getFinanceManagerEmail(companyCode);

            if (aEmails && aEmails.length > 0) {

                var aEmailObjects = aEmails.map(function (email) {
                    return {
                        email: email
                    };
                });

                oModel.setProperty(
                    "/approvedByEmails",
                    aEmailObjects
                );

                // auto select first approver
                oModel.setProperty(
                    "/approvedBy",
                    aEmails[0]
                );
            }
        },



        _fetchCurrencyFromCostCenter: function (companyCode) {

            return WorkflowAPI.fetchCurrencyFromCostCenter(
                companyCode
            );

        },
        _fetchGLAccounts: function (companyCode) {
            return WorkflowAPI.fetchGLAccounts(companyCode);
        },

        _fetchPurchaseOrders: function (supplierNumber) {
            return WorkflowAPI.fetchPurchaseOrders(supplierNumber);
        },

        _fetchPurchaseOrderItems: function (po) {
            return WorkflowAPI.fetchPurchaseOrderItems(po);
        },

        _fetchCostCentres: function (companyCode) {
            return WorkflowAPI.fetchCostCentres(companyCode);
        },

        _fetchInternalOrders: function (companyCode) {
            return WorkflowAPI.fetchInternalOrders(companyCode);
        },

        _fetchWBS: function () {
            return WorkflowAPI.fetchWBS();
        },

        _fetchSalesOrders: function () {
            return WorkflowAPI.fetchSalesOrders();
        },
        _fetchSalesOrderItems: function (salesOrder) {

            if (!salesOrder) {
                return Promise.resolve([]);
            }

            return WorkflowAPI.fetchSalesOrderItems(salesOrder)
                .then(function (aItems) {

                    console.log(
                        "Sales Order Items:",
                        aItems
                    );

                    return aItems || [];

                })
                .catch(function (error) {

                    console.error(
                        "Error fetching sales order items:",
                        error
                    );

                    return [];
                });
        },

        _fetchGLAccountForSupplierCustomer: function (
            supplierCustomerNumber,
            typeOfParty
        ) {

            var oModel = this.getView().getModel();

            var sCompanyCode =
                oModel.getProperty("/companyCode");

            return WorkflowAPI.fetchGLAccountForSupplierCustomer(
                supplierCustomerNumber,
                typeOfParty,
                sCompanyCode
            );

        },

        _getCurrentMonthEndDate: function () {
            var today = new Date();
            var year = today.getFullYear();
            var month = today.getMonth() + 1;

            var lastDay = new Date(year, month, 0).getDate();

            var formattedMonth = month.toString().padStart(2, '0');
            var formattedDay = lastDay.toString().padStart(2, '0');

            return "" + year + formattedMonth + formattedDay;
        },

        _getCurrentDateFormatted: function () {
            var today = new Date();
            var day = today.getDate().toString().padStart(2, '0');
            var month = (today.getMonth() + 1).toString().padStart(2, '0');
            var year = today.getFullYear();

            // Changed format from dd.mm.yyyy to mm-dd-yyyy
            return month + "-" + day + "-" + year;
        },

        _getEmailFromURL: function () {
            try {
                var oComponentData = this.getOwnerComponent().getComponentData();
                if (oComponentData && oComponentData.startupParameters) {
                    var email = oComponentData.startupParameters.email;
                    if (email && email[0]) {
                        return email[0];
                    }
                }

                var urlParams = new URLSearchParams(window.location.search);
                var emailFromQuery = urlParams.get('email');
                if (emailFromQuery) {
                    return emailFromQuery;
                }

                var hash = window.location.hash;
                if (hash) {
                    var hashParams = new URLSearchParams(hash.split('?')[1]);
                    var emailFromHash = hashParams.get('email');
                    if (emailFromHash) {
                        return emailFromHash;
                    }
                }

                if (window.location.hash.includes('email=')) {
                    var match = window.location.hash.match(/email=([^&]*)/);
                    if (match && match[1]) {
                        return decodeURIComponent(match[1]);
                    }
                }

                return "";
            } catch (error) {
                console.error("Error extracting email from URL:", error);
                return "";
            }
        },

        _getInstanceIdFromURL: function () {
            try {
                // Get the hash from URL
                var hash = window.location.hash;

                console.log("Full URL hash:", hash);

                // Pattern 1: #app-preview&/request/{instanceId}
                var match1 = hash.match(/#app-preview&\/Copy\/([a-f0-9\-]+)/i);

                // Pattern 2: #/request/{instanceId} (fallback for different URL structure)
                var match2 = hash.match(/#\/Copy\/([a-f0-9\-]+)/i);

                if (match1 && match1[1]) {
                    console.log("Instance ID found (Pattern 1):", match1[1]);
                    return match1[1];
                }

                if (match2 && match2[1]) {
                    console.log("Instance ID found (Pattern 2):", match2[1]);
                    return match2[1];
                }

                console.log("No instance ID found in URL");
                return null;
            } catch (error) {
                console.error("Error extracting instance ID from URL:", error);
                return null;
            }
        },

        onApprovedByChange: function (oEvent) {

            var sValue = oEvent.getSource().getValue();

            this.getView()
                .getModel()
                .setProperty("/approvedBy", sValue);
        },

        _loadInstanceData: function (sInstanceId) {

            var that = this;
            var oModel = this.getView().getModel();

            sap.ui.core.BusyIndicator.show(0);

            WorkflowAPI.fetchWorkflowInstanceContext(sInstanceId)

                .then(function (data) {

                    console.log("Instance data received:", data);

                    var formData = null;

                    if (data.form_accrualSubmissionForm_2) {
                        formData = data.form_accrualSubmissionForm_2;
                        console.log("✓ Using form_accrualSubmissionForm_2 data");
                    }
                    else if (data.startEvent && data.startEvent.accrual) {
                        formData = data.startEvent.accrual;
                        console.log("✓ Using startEvent.accrual data (fallback)");
                    }
                    else if (data.accrual) {
                        formData = data.accrual;
                        console.log("✓ Using accrual data (fallback)");
                    }
                    else {
                        console.error("Unexpected data structure:", data);
                        throw new Error("Invalid instance data format - cannot find form data");
                    }

                    console.log("Form data extracted:", formData);

                    that._mapInstanceDataToModel(formData, sInstanceId);

                })

                .catch(function (error) {

                    console.error("Error loading instance data:", error);

                    MessageBox.error(
                        "Failed to load instance data.\n\n" + error.message
                    );

                })

                .finally(function () {
                    sap.ui.core.BusyIndicator.hide();
                });

        },

        _mapInstanceDataToModel: function (formData, sInstanceId) {

            var that = this;
            var oModel = this.getView().getModel();

            console.log("Mapping form data to model:", formData);

            // Mark as edit mode
            oModel.setProperty("/isEditMode", true);
            oModel.setProperty("/instanceId", sInstanceId);

            // Helper function
            var getValue = function (obj, key1, key2, key3) {
                return obj[key1] || obj[key2] || obj[key3] || "";
            };

            // ───────────────── HEADER MAPPING ─────────────────

            oModel.setProperty("/affiliate", getValue(formData, "affiliate", "Affiliate"));
            oModel.setProperty("/companyCode", getValue(formData, "companyCode", "CompanyCode"));
            oModel.setProperty("/nameAccrual", getValue(formData, "nameYourAccrual", "NameYourAccrual"));
            oModel.setProperty("/requestedBy", getValue(formData, "requestedBy", "RequestedBy"));
            oModel.setProperty("/approvedBy", getValue(formData, "approvedBy", "ApprovedBy"));
            oModel.setProperty("/cutoffDate", getValue(formData, "accrualCutOffDate", "AccrualCutOffDate"));

            // ───────────────── TYPE OF REQUEST (Accrual / Reclass) ─────────────────
            // Copy_typeOfRequestSelect binds to /typeOfRequest
            var sTypeOfRequest =
                formData["typeOfRequest_1"] ||
                "";
            oModel.setProperty("/typeOfRequest", sTypeOfRequest);

            // ───────────────── TYPE OF ACCRUAL (Commission / Rebate / Adhoc / Technology) ─────────────────
            // Copy_requestTypeSelect binds to /requestType
            var sAccrualType =
                getValue(formData, "typeOfAccrual", "TypeofRequest", "accrualType") || "";
            oModel.setProperty("/requestType", sAccrualType);

            oModel.setProperty("/typeOfParty", getValue(formData, "typeOfParty", "Partytype"));

            var sCostCenterOwnerRaw = getValue(formData, "CostCenterOwner", "costCenterOwner", "");

            if (sCostCenterOwnerRaw) {

                // Build email array
                var aCCOwnerEmails = sCostCenterOwnerRaw.split(",")

                    .map(function (e) {
                        return e.trim();
                    })

                    .filter(function (e) {
                        return e !== "";
                    })

                    .map(function (e) {
                        return {
                            email: e
                        };
                    });

                // Set all emails to dropdown
                oModel.setProperty(
                    "/costCenterOwnerEmails",
                    aCCOwnerEmails
                );

                // IMPORTANT:
                // Store FULL comma separated value
                // instead of first email
                oModel.setProperty(
                    "/costCenterOwner",
                    sCostCenterOwnerRaw
                );

            } else {

                oModel.setProperty(
                    "/costCenterOwnerEmails",
                    []
                );

                oModel.setProperty(
                    "/costCenterOwner",
                    ""
                );
            }

            // ───────────────── GL TYPE ─────────────────

            //var sGLType = getValue(formData, "debitGLType", "DebitGLType");
            //oModel.setProperty("/glType", sGLType);

            // ───────────────── LINE ITEMS ─────────────────

            var accrualTable = formData.accrual_Table || formData.Accrual_Table || [];

            console.log("Accrual table data:", accrualTable);

            if (accrualTable && accrualTable.length > 0) {

                var aItems = accrualTable
                    .filter(function (item) {
                        return (item.creditDebitIndicator || item.CreditDebitIndicator) === "Debit";
                    })
                    .map(function (item) {
                        return {
                            supplier: getValue(item, "supplierCustomer", "SupplierCustomer"),
                            supplierNumber: "",
                            description: getValue(item, "description", "Description"),
                            currency: getValue(item, "currency", "Currency"),
                            excludeTax: getValue(item, "excludeTax", "ExcludeTax"),
                            glAccount: getValue(item, "gLAccountCode", "GLAccountCode"),
                            creditDebit: "Debit",
                            poNumber: getValue(item, "purchaseOrderNumber", "PurchaseOrderNumber"),
                            poLineItem: getValue(item, "purchaseOrderLineItem", "PurchaseOrderLineItem"),
                            costCentre: getValue(item, "costCentre", "CostCentre"),
                            internalOrder: getValue(item, "internalOrder", "InternalOrder"),
                            wbs: getValue(item, "wBS", "WBS"),
                            tradingPartner: getValue(item, "tradingPartner", "TradingPartner"),
                            salesOrder: getValue(item, "salesOrderNumber", "SalesOrderNumber"),
                            salesOrderItem: getValue(item, "salesOrderItemNumber", "SalesOrderItemNumber"),
                            SegmentProduct: getValue(item, "segmentProduct", "SegmentProduct"),
                            segmentShip: getValue(item, "segmentShiptoParty", "SegmentShiptoParty"),
                            segmentSold: getValue(item, "segmentSoldtoParty", "SegmentSoldtoParty"),

                            materialNumber: getValue(item, "materialNumber", "MaterialNumber"),
                            countryRegionKey: getValue(item, "countryRegionKey", "Country_Regionkey"),

                            purchaseOrders: [],
                            purchaseOrderItems: [],
                            salesOrderItems: [],
                            filteredGLAccounts: [],

                            supplierState: "None", supplierStateText: "",
                            descriptionState: "None", descriptionStateText: "",
                            currencyState: "None", currencyStateText: "",
                            excludeTaxState: "None", excludeTaxStateText: "",
                            glAccountState: "None", glAccountStateText: "",
                            creditDebitState: "None", creditDebitStateText: ""
                        };
                    });
                oModel.setProperty("/items", aItems);

                this._applyDebitGLLogic();

                setTimeout(function () {
                    this._convertToUSD();
                }.bind(this), 0);

                this._loadSupplierNumbersAndPOData(
                    accrualTable,
                    getValue(formData, "typeOfParty", "Partytype")
                );

            } else {
                console.warn("No accrual table data found");
            }

            // ───────────────── CURRENCY ─────────────────

            if (accrualTable && accrualTable.length > 0) {
                oModel.setProperty("/currency",
                    getValue(accrualTable[0], "currency", "Currency")
                );
            }

            // ───────────────── AFFILIATE DEPENDENT LOAD ─────────────────

            var sAffiliate = getValue(formData, "affiliate", "Affiliate");
            var sCompanyCode = getValue(formData, "companyCode", "CompanyCode");

            if (sAffiliate && sCompanyCode) {

                var bCompanyCodesLoaded = oModel.getProperty("/companyCodesLoaded");

                if (!bCompanyCodesLoaded) {
                    this._fetchCompanyCodes()
                        .then(function () {
                            return that._fetchRelatedDataForAffiliate(sCompanyCode);
                        });
                } else {
                    this._fetchRelatedDataForAffiliate(sCompanyCode);
                }
            }

            console.log("Instance data mapped to model successfully");
        },



        _loadSupplierNumbersAndPOData: function (accrualTable, typeOfParty) {
            var that = this;
            var oModel = this.getView().getModel();

            console.log("Loading supplier numbers and PO data...");

            var oTable = this.byId("Copy_itemsTable");
            if (oTable) {
                oTable.setBusy(true);
                oTable.setBusyIndicatorDelay(0);
            }
            sap.ui.core.BusyIndicator.show(0);

            var oSupplierNumberCache = {};
            var oPOCache = {};

            var processItem = function (index) {
                if (index >= accrualTable.length) {
                    sap.ui.core.BusyIndicator.hide();
                    if (oTable) {
                        oTable.setBusy(false);
                    }
                    MessageToast.show("Data loaded successfully");
                    return Promise.resolve();
                }

                var item = accrualTable[index];
                var supplierCustomerName = item.supplierCustomer || item.SupplierCustomer || "";
                var existingPONumber = item.purchaseOrderNumber || item.PurchaseOrderNumber || "";
                var existingPOLineItem = item.purchaseOrderLineItem || item.PurchaseOrderLineItem || "";

                console.log("Processing item", index, ":", supplierCustomerName, "PO:", existingPONumber);

                if (!supplierCustomerName) {
                    return processItem(index + 1);
                }

                var getSupplierNumber = function () {
                    if (oSupplierNumberCache[supplierCustomerName]) {
                        console.log("Using cached supplier number for:", supplierCustomerName);
                        return Promise.resolve(oSupplierNumberCache[supplierCustomerName]);
                    }
                    return that._searchSupplierByName(supplierCustomerName, typeOfParty)
                        .then(function (supplierNumber) {
                            if (supplierNumber) {
                                oSupplierNumberCache[supplierCustomerName] = supplierNumber;
                            }
                            return supplierNumber;
                        });
                };

                return getSupplierNumber()
                    .then(function (supplierNumber) {
                        if (!supplierNumber) {
                            console.warn("No supplier number found for:", supplierCustomerName);
                            return Promise.resolve();
                        }

                        console.log("Supplier number for item", index, ":", supplierNumber);
                        oModel.setProperty("/items/" + index + "/supplierNumber", supplierNumber);

                        if (typeOfParty !== "Supplier") {
                            return Promise.resolve();
                        }

                        var getPurchaseOrders = function () {
                            if (oPOCache[supplierNumber]) {
                                console.log("Using cached POs for supplier:", supplierNumber);
                                return Promise.resolve(oPOCache[supplierNumber]);
                            }
                            return that._fetchPurchaseOrders(supplierNumber)
                                .then(function (aPurchaseOrders) {
                                    // Filter out POs where PurchasingCompletenessStatus is true
                                    var aFiltered = aPurchaseOrders.filter(function (po) {
                                        return po.PurchasingCompletenessStatus !== true &&
                                            po.PurchasingCompletenessStatus !== "true";
                                    });
                                    oPOCache[supplierNumber] = aFiltered;
                                    return aFiltered;
                                });
                        };

                        return getPurchaseOrders()
                            .then(function (aFiltered) {
                                console.log("POs for item " + index + ":", aFiltered);

                                // STEP 1: Set filtered purchaseOrders array
                                oModel.setProperty("/items/" + index + "/purchaseOrders", aFiltered);

                                if (!existingPONumber || aFiltered.length === 0) {
                                    return Promise.resolve();
                                }

                                // Check if existing PO is in filtered list
                                var poExists = aFiltered.some(function (po) {
                                    return po.PurchaseOrder === existingPONumber;
                                });

                                if (!poExists) {
                                    console.warn("Existing PO " + existingPONumber + " is completed/filtered out");
                                    return Promise.resolve();
                                }

                                // STEP 2: Wait for ComboBox to fully bind items
                                return new Promise(function (resolve) {
                                    setTimeout(function () {
                                        // STEP 3: Now set the selected key
                                        oModel.setProperty("/items/" + index + "/poNumber", existingPONumber);
                                        console.log("poNumber set for item " + index + ":", existingPONumber);

                                        if (!existingPOLineItem) {
                                            resolve();
                                            return;
                                        }

                                        // STEP 4: Fetch and set PO line items
                                        that._fetchPurchaseOrderItems(existingPONumber)
                                            .then(function (aPOItems) {
                                                oModel.setProperty("/items/" + index + "/purchaseOrderItems", aPOItems);

                                                setTimeout(function () {
                                                    oModel.setProperty("/items/" + index + "/poLineItem", existingPOLineItem);
                                                    console.log("poLineItem set for item " + index + ":", existingPOLineItem);
                                                    resolve();
                                                }, 500);
                                            })
                                            .catch(function (error) {
                                                console.error("Error fetching PO items for item " + index, error);
                                                resolve();
                                            });
                                    }, 800);
                                });
                            });
                    })
                    .catch(function (error) {
                        console.error("Error loading data for item " + index, error);
                    })
                    .then(function () {
                        return processItem(index + 1);
                    });
            };

            setTimeout(function () {
                processItem(0)
                    .catch(function (error) {
                        console.error("Error in sequential processing:", error);
                        sap.ui.core.BusyIndicator.hide();
                        if (oTable) {
                            oTable.setBusy(false);
                        }
                    });
            }, 800);
        },

        _searchSupplierByName: function (supplierName, typeOfParty) {
            return WorkflowAPI.searchSupplierByName(supplierName, typeOfParty);
        },


        _preparePayloadWithCreditLogic: function () {

            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];

            var aFinalItems = [];

            aItems.forEach(function (oItem) {

                aFinalItems.push({ ...oItem });

                if (oItem.creditDebit === "Debit") {

                    var oCreditItem = { ...oItem };

                    oCreditItem.creditDebit = "Credit";

                    var sAccrualType = oModel.getProperty("/requestType");

                    var oGLMap = {
                        "Commission": "21000010",
                        "Rebate": "21000011",
                        "Adhoc": "21000012",
                        "Technology": "21000013"
                    };

                    oCreditItem.glAccount = oGLMap[sAccrualType] || "";

                    aFinalItems.push(oCreditItem);
                }

            }.bind(this));

            return aFinalItems;
        },



        _fetchRelatedDataForAffiliate: function (sCompanyCode) {
            var that = this;
            var oModel = this.getView().getModel();

            if (!sCompanyCode) {
                return Promise.resolve();
            }

            sap.ui.core.BusyIndicator.show(0);

            // Load currencies silently in the background
            var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
            if (!bCurrenciesLoaded) {
                this._fetchCurrencies()
                    .then(function (currencies) {
                        if (currencies && currencies.length > 0) {
                            oModel.setProperty("/currencies", currencies);
                            oModel.setProperty("/currenciesLoaded", true);
                            console.log("Currencies loaded in background:", currencies.length);
                        }
                    })
                    .catch(function (error) {
                        console.error("Error loading currencies in background:", error);
                    });
            }

            return this._fetchGLAccounts(sCompanyCode)
                .then(function (glAccounts) {
                    if (glAccounts && glAccounts.length > 0) {
                        oModel.setProperty("/glAccounts", glAccounts);
                        oModel.setProperty("/glAccountsLoaded", true);
                    }

                    return that._fetchCostCentres(sCompanyCode);
                })
                .then(function (costCentres) {
                    if (costCentres && costCentres.length > 0) {
                        oModel.setProperty("/costCentres", costCentres);
                        oModel.setProperty("/costCentresLoaded", true);
                    }

                    return that._fetchInternalOrders(sCompanyCode);
                })
                .then(function (internalOrders) {
                    if (internalOrders && internalOrders.length > 0) {
                        oModel.setProperty("/internalOrders", internalOrders);
                        oModel.setProperty("/internalOrdersLoaded", true);
                    }

                    return WorkflowAPI.fetchWBS()
                        .then(function (aWBS) {

                            if (aWBS && aWBS.length > 0) {

                                oModel.setProperty("/wbsElements", aWBS);

                                oModel.setProperty("/wbsLoaded", true);

                            }

                            return that._fetchSalesOrders();
                        });
                })
                .then(function (salesOrders) {
                    if (salesOrders && salesOrders.length > 0) {
                        oModel.setProperty("/salesOrders", salesOrders);
                        oModel.setProperty("/salesOrdersLoaded", true);
                    }
                })
                .finally(function () {
                    sap.ui.core.BusyIndicator.hide();
                });
        },

        _calculateFinanceApproval: function (oData) {
            var sCompanyCode = (oData.companyCode || "").toUpperCase().trim();

            // Rule 1: China company codes always require finance approval
            if (sCompanyCode === "CNC1" || sCompanyCode === "CNC2") {
                console.log("Finance approval required: China company code detected -", sCompanyCode);
                return true;
            }

            // Rule 2: Check if ANY single line item amount exceeds 25,000
            var aItems = oData.items || [];
            var bHighValue = aItems.some(function (item) {
                if (!item.excludeTax) {
                    return false;
                }
                var fAmount = parseFloat(item.excludeTax);
                if (isNaN(fAmount)) {
                    return false;
                }
                return fAmount > 25000;
            });

            if (bHighValue) {
                console.log("Finance approval required: Line item amount exceeds 25,000");
                return true;
            }

            console.log("Finance approval not required");
            return false;
        },

        _preparePayloadForPatch: function (oData, iStatus) {

            var that = this;
            var oModel = this.getView().getModel();

            // Ensure requestType is set
            oData.requestType = oData.accrualType || oData.requestType;

            // Finance approval logic
            var bFinanceApproval = this._calculateFinanceApproval(oData);

            // APPLY AUTO CREDIT LOGIC
            var aProcessedItems = this._preparePayloadWithCreditLogic();

            var totalExcludeTax = oModel.getProperty("/totalExcludeTax") || 0;
            var totalUSD = oModel.getProperty("/totalUSD") || 0;

            // ✅ FIX: Build comma-separated string from full emails array
            var sCostCenterOwnerEmails = (oData.costCenterOwnerEmails || [])
                .map(function (o) { return o.email; })
                .join(",");

            // Fallback: if array is empty but costCenterOwner string exists, use it
            if (!sCostCenterOwnerEmails && oData.costCenterOwner) {
                sCostCenterOwnerEmails = oData.costCenterOwner;
            }

            var payload = {
                status: "COMPLETED",
                decision: "submit",
                context: {
                    affiliate: oData.affiliate || "",
                    companyCode: oData.companyCode || "",
                    nameYourAccrual: oData.nameAccrual || "",
                    requestedBy: oData.requestedBy || "",
                    approvedBy: oData.approvedBy || "",
                    costCenterOwner: sCostCenterOwnerEmails,      // ✅ FIXED
                    CostCenterOwner: sCostCenterOwnerEmails,      // ✅ FIXED
                    accrualCutOffDate: oData.cutoffDate || "",

                    // TYPE OF ACCRUAL
                    TypeofRequest: oData.requestType || oData.accrualType || "",
                    typeOfRequest: oData.requestType || oData.accrualType || "",
                    typeOfAccrual: oData.requestType || oData.accrualType || "",

                    // TYPE OF REQUEST (Accrual / Reclass)
                    Requesttype: oData.typeOfRequest || "",
                    requestType: oData.typeOfRequest || "",
                    typeOfRequest_1: oData.typeOfRequest || "",

                    typeOfParty: oData.typeOfParty || "",
                    debitGLType: oData.debitGLType,

                    status: iStatus.toString(),
                    financeApproval: bFinanceApproval,

                    supportingDocuments: oData.dmsFolderId
                        ? "spa-res:cmis:folderid:" + oData.dmsFolderId
                        : "",

                    Lastupdateddate: this._getCurrentDateFormatted(),
                    TotalAmount: totalUSD.toString(),
                    Total_Exclude_Tax: totalExcludeTax.toString(),

                    // USE PROCESSED ITEMS (WITH AUTO CREDIT)
                    accrual_Table: aProcessedItems.map(function (item, index) {

                        var cdIndicator1 = "";
                        if (item.creditDebit === "Debit") {
                            cdIndicator1 = "D";
                        } else if (item.creditDebit === "Credit") {
                            cdIndicator1 = "C";
                        }

                        return {
                            itemNumber: (index + 1).toString(),
                            supplierCustomer: item.supplier || "",
                            purchaseOrderNumber: item.poNumber || "",
                            purchaseOrderLineItem: item.poLineItem || "",
                            description: item.description || "",
                            currency: item.currency || "",
                            excludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                            gLAccountCode: item.glAccount
                                ? item.glAccount.split(" - ")[0].trim()
                                : "",
                            creditDebitIndicator: item.creditDebit || "",
                            cDIndicator: cdIndicator1,
                            costCentre: item.costCentre || "",
                            internalOrder: item.internalOrder || "",
                            wBS: item.wbs || "",
                            tradingPartner: item.tradingPartner || "",
                            salesOrderNumber: item.salesOrder || "",
                            salesOrderItemNumber: item.salesOrderItem || "",
                            segmentProduct: item.SegmentProduct || "",
                            segmentShiptoParty: item.segmentShip || "",
                            segmentSoldtoParty: item.segmentSold || "",
                            materialNumber: item.materialNumber || "",
                            countryRegionKey: item.countryRegionKey || ""
                        };
                    })
                }
            };

            return payload;
        },

        onPONumberChange: function (oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sPurchaseOrder = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sPurchaseOrder) {
                return;
            }

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();

            // Clear existing PO line item data
            oModel.setProperty(sPath + "/poLineItem", "");
            oModel.setProperty(sPath + "/description", "");
            oModel.setProperty(sPath + "/excludeTax", "");
            oModel.setProperty(sPath + "/purchaseOrderItems", []);

            oComboBox.setBusy(true);

            this._fetchPurchaseOrderItems(sPurchaseOrder)
                .then(function (aPOItems) {
                    if (aPOItems && aPOItems.length > 0) {
                        oModel.setProperty(sPath + "/purchaseOrderItems", aPOItems);
                        var firstItem = aPOItems[0];
                        oModel.setProperty(sPath + "/poLineItem", firstItem.PurchaseOrderItem);
                        oModel.setProperty(sPath + "/description", firstItem.PurchaseOrderItemText);
                        oModel.setProperty(sPath + "/excludeTax", firstItem.NetAmount);
                        // ✅ NEW: map Material
                        oModel.setProperty(sPath + "/materialNumber", firstItem.Material || "");
                        that._convertToUSD();
                        oModel.setProperty(sPath + "/poNetAmount", firstItem.NetAmount);
                        that._validateExcludeTaxValue(sPath, firstItem.NetAmount);
                        MessageToast.show("PO Line Item details auto-populated");
                    } else {
                        MessageToast.show("No line items found for this PO");
                    }
                })
                .catch(function (error) {
                    console.error("Error loading PO items:", error);
                    MessageToast.show("Failed to load PO items");
                })
                .finally(function () {
                    oComboBox.setBusy(false);
                });
        },

        onPOLineItemChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var sSelectedItem = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sSelectedItem) return;

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();
            var aPOItems = oModel.getProperty(sPath + "/purchaseOrderItems");

            if (aPOItems && aPOItems.length > 0) {
                var selectedPOItem = aPOItems.find(function (item) {
                    return item.PurchaseOrderItem === sSelectedItem;
                });

                if (selectedPOItem) {
                    oModel.setProperty(sPath + "/description", selectedPOItem.PurchaseOrderItemText);
                    oModel.setProperty(sPath + "/excludeTax", selectedPOItem.NetAmount);
                    this._convertToUSD();
                    oModel.setProperty(sPath + "/poNetAmount", selectedPOItem.NetAmount);
                    // ✅ NEW: map Material
                    oModel.setProperty(sPath + "/materialNumber", selectedPOItem.Material || "");
                    this._validateExcludeTaxValue(sPath, selectedPOItem.NetAmount);
                    MessageToast.show("Description and Amount updated");
                }
            }
        },


        _createEmptyItem: function () {
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


        _onCostObjectChange: function (oEvent) {

            var oModel = this.getView().getModel();
            var oContext = oEvent.getSource().getBindingContext();

            if (!oContext) return;

            var sPath = oContext.getPath();

            var sCostCentre = oModel.getProperty(sPath + "/costCentre");
            var sInternalOrder = oModel.getProperty(sPath + "/internalOrder");
            var sWBS = oModel.getProperty(sPath + "/wbs");

            // Cost Centre filled → clear others
            if (sCostCentre) {
                oModel.setProperty(sPath + "/internalOrder", "");
                oModel.setProperty(sPath + "/wbs", "");
            }

            // Internal Order filled → clear others
            if (sInternalOrder) {
                oModel.setProperty(sPath + "/costCentre", "");
                oModel.setProperty(sPath + "/wbs", "");
            }

            // WBS filled → clear others
            if (sWBS) {
                oModel.setProperty(sPath + "/costCentre", "");
                oModel.setProperty(sPath + "/internalOrder", "");
            }
        },



        onAffiliateChange: function (oEvent) {
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
            this._applyDebitGLLogic();

            var oCompanyCodeInput = this.byId("companyCodeInput");
            if (oCompanyCodeInput) {
                oCompanyCodeInput.setValueState("None");
                oCompanyCodeInput.setValueStateText("");
            }

            if (sCompanyCode) {
                sap.ui.core.BusyIndicator.show(0);

                // Load currencies
                var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
                if (!bCurrenciesLoaded) {
                    this._fetchCurrencies()
                        .then(function (currencies) {
                            if (currencies && currencies.length > 0) {
                                oModel.setProperty("/currencies", currencies);
                                oModel.setProperty("/currenciesLoaded", true);
                                console.log("Currencies loaded in background:", currencies.length);
                            }
                        })
                        .catch(function (error) {
                            console.error("Error loading currencies in background:", error);
                        });
                }

                this._fetchCurrencyFromCostCenter(sCompanyCode)
                    .then(function (currency) {
                        if (currency) {
                            oModel.setProperty("/currency", currency);

                            var aItems = oModel.getProperty("/items");
                            aItems.forEach(function (item, index) {
                                oModel.setProperty("/items/" + index + "/currency", currency);
                            });

                            MessageToast.show("Company Code " + sCompanyCode + " and Currency " + currency + " automatically selected");
                        } else {
                            MessageToast.show("Company Code " + sCompanyCode + " selected. Currency could not be fetched.");
                        }

                        return that._fetchGLAccounts(sCompanyCode);
                    })
                    .then(function (glAccounts) {
                        if (glAccounts && glAccounts.length > 0) {
                            oModel.setProperty("/glAccounts", glAccounts);
                            oModel.setProperty("/glAccountsLoaded", true);
                        }

                        return that._fetchCostCentres(sCompanyCode);
                    })
                    .then(function (costCentres) {
                        if (costCentres && costCentres.length > 0) {
                            oModel.setProperty("/costCentres", costCentres);
                            oModel.setProperty("/costCentresLoaded", true);
                        }

                        return that._fetchInternalOrders(sCompanyCode);
                    })
                    .then(function (internalOrders) {
                        if (internalOrders && internalOrders.length > 0) {
                            oModel.setProperty("/internalOrders", internalOrders);
                            oModel.setProperty("/internalOrdersLoaded", true);
                        }
                    })
                    .catch(function (error) {
                        console.error("Error in affiliate change handler:", error);
                        MessageBox.error("Failed to fetch data for selected affiliate.");
                    })
                    .finally(function () {
                        sap.ui.core.BusyIndicator.hide();
                    });
            }
        },

        onTypeOfPartyChange: function (oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedType = oSelect.getSelectedKey();

            oSelect.setValueState("None");
            oSelect.setValueStateText("");

            if (sSelectedType) {
                MessageToast.show(sSelectedType + " type selected.");
            }
        },

        _validateSupportingDocuments: function () {
            var oModel = this.getView().getModel();
            var aDocs = oModel.getProperty("/dmsDocuments");

            if (!aDocs || aDocs.length === 0) {
                sap.m.MessageBox.error("At least one supporting document is required");
                return false;
            }

            return true;
        },

        onRequestTypeChange: function (oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedType = oSelect.getSelectedKey();
            var oModel = this.getView().getModel();

            // Clear value state
            oSelect.setValueState("None");
            oSelect.setValueStateText("");

            if (sSelectedType === "Reclass") {
                var aItems = oModel.getProperty("/items");

                // If more than 2 rows exist, trim to 2
                if (aItems.length > 2) {
                    MessageBox.confirm(
                        "Reclass request allows maximum 2 line items. " +
                        "Current items will be trimmed to 2. Do you want to continue?",
                        {
                            onClose: function (sAction) {
                                if (sAction === MessageBox.Action.OK) {
                                    aItems = aItems.slice(0, 2);
                                    oModel.setProperty("/items", aItems);
                                    MessageToast.show("Line items trimmed to 2 for Reclass request");
                                } else {
                                    // Revert back to Accrual
                                    oModel.setProperty("/requestType", "Accrual");
                                    oSelect.setSelectedKey("Accrual");
                                }
                            }
                        }
                    );
                } else if (aItems.length === 1) {
                    // Add second empty row automatically for Reclass
                    var sCurrency = oModel.getProperty("/currency");
                    var newItem = this._createEmptyItem();
                    if (sCurrency) {
                        newItem.currency = sCurrency;
                    }
                    aItems.push(newItem);
                    oModel.setProperty("/items", aItems);
                    MessageToast.show("Reclass selected - 2 line items required");
                } else {
                    MessageToast.show("Reclass selected - maximum 2 line items allowed");
                }
            }
        },

        onAddRow: function () {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");
            var sCurrency = oModel.getProperty("/currency");
            var sRequestType = oModel.getProperty("/requestType");

            var sType = oModel.getProperty("/typeOfRequest");

            if (sType === "Reclass" && aItems.length >= 2) {
                MessageBox.warning("Only 2 rows allowed for Reclass");
                return;
            }

            var newItem = this._createEmptyItem();

            // Existing logic
            if (sCurrency) {
                newItem.currency = sCurrency;
            }

            //ADD THIS BLOCK (GL Fix)
            var aGL = oModel.getProperty("/filteredGLGlobal");
            if (aGL && aGL.length) {
                newItem.filteredGLAccounts = aGL;
            }
            //END

            aItems.push(newItem);
            oModel.setProperty("/items", aItems);

            MessageToast.show("New row added");
        },

        onDeleteRow: function (oEvent) {

            var oModel = this.getView().getModel();

            var aItems = oModel.getProperty("/items") || [];

            // Prevent deleting last row
            if (aItems.length === 1) {

                MessageBox.warning(
                    "At least one line item is required."
                );

                return;
            }

            // Get selected row index
            var oContext = oEvent.getSource()
                .getBindingContext();

            var sPath = oContext.getPath();

            var iIndex = parseInt(
                sPath.split("/")[2],
                10
            );

            // Delete row
            aItems.splice(iIndex, 1);

            // Update model
            oModel.setProperty("/items", aItems);

            // Refresh UI
            oModel.refresh(true);

            // Recalculate totals
            this._convertToUSD();

            MessageToast.show(
                "Line item deleted successfully"
            );
        },
        onSelectionChange: function (oEvent) {
            var oTable = this.byId("Copy_itemsTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oModel = this.getView().getModel();

            oModel.setProperty("/selectedItemsCount", aSelectedItems.length);
        },

        onDeleteSelected: function () {

            var that = this;

            var oTable =
                this.byId("Copy_itemsTable");

            var aSelectedItems =
                oTable.getSelectedItems();

            var oModel =
                this.getView().getModel();

            var aItems =
                oModel.getProperty("/items");

            if (
                aItems.length -
                aSelectedItems.length < 1
            ) {

                MessageBox.warning(
                    "At least one row must remain."
                );

                return;
            }

            MessageBox.confirm(
                "Delete " +
                aSelectedItems.length +
                " row(s)?",
                {

                    onClose: function (sAction) {

                        if (
                            sAction === MessageBox.Action.OK
                        ) {

                            var aIndicesToDelete = [];

                            aSelectedItems.forEach(
                                function (oItem) {

                                    var sPath =
                                        oItem.getBindingContextPath();

                                    var iIndex =
                                        parseInt(
                                            sPath.split("/").pop()
                                        );

                                    aIndicesToDelete.push(
                                        iIndex
                                    );

                                }
                            );

                            aIndicesToDelete.sort(
                                function (a, b) {

                                    return b - a;

                                }
                            );

                            aIndicesToDelete.forEach(
                                function (iIndex) {

                                    aItems.splice(
                                        iIndex,
                                        1
                                    );

                                }
                            );

                            oModel.setProperty(
                                "/items",
                                aItems
                            );

                            oModel.setProperty(
                                "/selectedItemsCount",
                                0
                            );

                            oTable.removeSelections(true);

                            that._refreshResponsiblePersonEmails();

                            MessageToast.show(
                                aIndicesToDelete.length +
                                " row(s) deleted"
                            );
                        }
                    }
                }
            );
        },

        onFieldChange: function (oEvent) {
            var oSource = oEvent.getSource();
            oSource.setValueState("None");
            oSource.setValueStateText("");
        },

        onCostCenterOwnerChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var sKey = oComboBox.getSelectedKey();
            var oModel = this.getView().getModel();
            oModel.setProperty("/costCenterOwner", sKey);
            oComboBox.setValueState("None");
            oComboBox.setValueStateText("");
        },

        onTableFieldChange: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();

            if (!oContext) {
                return;
            }

            var sPath = oContext.getPath();
            var oModel = this.getView().getModel();

            var sFieldName = oSource.getBinding("value") ?
                oSource.getBinding("value").getPath() :
                oSource.getBinding("selectedKey").getPath();

            var sStatePath = sPath + "/" + sFieldName + "State";
            var sStateTextPath = sPath + "/" + sFieldName + "StateText";

            oModel.setProperty(sStatePath, "None");
            oModel.setProperty(sStateTextPath, "");
        },

        onCostCentreChange: function (oEvent) {
            var oComboBox = oEvent.getSource();
            var oContext = oComboBox.getBindingContext();
            if (!oContext) return;

            var sPath = oContext.getPath();
            var oModel = this.getView().getModel();
            var sSelectedCostCentre = oComboBox.getSelectedKey();

            // Clear validation state
            oModel.setProperty(sPath + "/costCentreState", "None");
            oModel.setProperty(sPath + "/costCentreStateText", "");

            // Always refresh Cost Center Owner emails regardless of which row changed
            this._refreshResponsiblePersonEmails();
        },

        onInternalOrderChange: function (oEvent) {

            var oContext =
                oEvent.getSource().getBindingContext();

            if (!oContext) return;

            var sPath = oContext.getPath();

            this._refreshResponsiblePersonEmails();
        },

        onWBSChange: function (oEvent) {

            var oContext =
                oEvent.getSource().getBindingContext();

            if (!oContext) return;

            var sPath = oContext.getPath();

            this._refreshResponsiblePersonEmails();
        },

        _refreshResponsiblePersonEmails: function () {

            var oModel = this.getView().getModel();

            var aItems = oModel.getProperty("/items") || [];

            var aPromises = [];

            var aCollectedEmails = [];

            var aCostCentersDone = [];

            var aInternalOrdersDone = [];

            var aWBSDone = [];

            var aInternalOrders =
                oModel.getProperty("/internalOrders") || [];

            var aWBS =
                oModel.getProperty("/wbsElements") || [];

            aItems.forEach(function (item) {

                // =========================
                // COST CENTER
                // =========================
                if (
                    item.costCentre &&
                    aCostCentersDone.indexOf(item.costCentre) === -1
                ) {

                    aCostCentersDone.push(item.costCentre);

                    aPromises.push(

                        WorkflowAPI.fetchApproverEmailFromCostCenter(
                            item.costCentre
                        )

                            .then(function (email) {

                                if (email) {

                                    aCollectedEmails.push(
                                        email.trim()
                                    );

                                }

                            })

                            .catch(function () { })

                    );
                }

                // =========================
                // INTERNAL ORDER
                // =========================
                if (
                    item.internalOrder &&
                    aInternalOrdersDone.indexOf(item.internalOrder) === -1
                ) {

                    aInternalOrdersDone.push(
                        item.internalOrder
                    );

                    var oOrder = aInternalOrders.find(
                        function (ord) {

                            return (
                                ord.OrderNumber ===
                                item.internalOrder
                            );

                        }
                    );

                    if (oOrder && oOrder.RespPersonID) {

                        aPromises.push(

                            WorkflowAPI.fetchResponsibleEmail({
                                Resppersonid:
                                    oOrder.RespPersonID
                            })

                                .then(function (email) {

                                    if (email) {

                                        aCollectedEmails.push(
                                            email.trim()
                                        );

                                    }

                                })

                                .catch(function () { })

                        );
                    }
                }

                // =========================
                // WBS
                // =========================
                if (
                    item.wbs &&
                    aWBSDone.indexOf(item.wbs) === -1
                ) {

                    aWBSDone.push(item.wbs);

                    var oWBS = aWBS.find(function (w) {

                        return (
                            w.WBSElement === item.wbs
                        );

                    });

                    if (
                        oWBS &&
                        oWBS.ResponsiblePerson
                    ) {

                        aPromises.push(

                            WorkflowAPI.fetchResponsibleEmail({
                                Responsibleperson:
                                    oWBS.ResponsiblePerson
                            })

                                .then(function (email) {

                                    if (email) {

                                        aCollectedEmails.push(
                                            email.trim()
                                        );

                                    }

                                })

                                .catch(function () { })

                        );
                    }
                }

            });

            Promise.all(aPromises)

                .then(function () {

                    var aUniqueEmails = [];

                    aCollectedEmails.forEach(function (email) {

                        if (
                            email &&
                            aUniqueEmails.indexOf(email) === -1
                        ) {

                            aUniqueEmails.push(email);

                        }

                    });

                    console.log(
                        "Final Responsible Emails:",
                        aUniqueEmails
                    );

                    var aEmailObjects =
                        aUniqueEmails.map(function (email) {

                            return {
                                email: email
                            };

                        });

                    oModel.setProperty(
                        "/costCenterOwnerEmails",
                        aEmailObjects
                    );

                    if (aUniqueEmails.length === 1) {

                        oModel.setProperty(
                            "/costCenterOwner",
                            aUniqueEmails[0]
                        );

                    } else {

                        var sExisting =
                            oModel.getProperty(
                                "/costCenterOwner"
                            );

                        if (
                            aUniqueEmails.indexOf(sExisting) === -1
                        ) {

                            oModel.setProperty(
                                "/costCenterOwner",
                                ""
                            );

                        }

                    }

                });

        },


        onExcludeTaxChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext();

            if (!oContext) return;

            this._validateExcludeTaxValue(
                oContext.getPath(),
                oInput.getValue()
            );
        },


        onPONumberOpen: function (oEvent) {
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
                .then(function (aPurchaseOrders) {
                    // Filter out POs where PurchasingCompletenessStatus is true
                    var aFiltered = aPurchaseOrders.filter(function (po) {
                        return po.PurchasingCompletenessStatus !== true &&
                            po.PurchasingCompletenessStatus !== "true";
                    });
                    oModel.setProperty(sPath + "/purchaseOrders", aFiltered);
                    if (aFiltered.length === 0) MessageToast.show("No open purchase orders found");
                })
                .catch(function (error) {
                    console.error("Error loading purchase orders:", error);
                    MessageToast.show("Failed to load purchase orders");
                })
                .finally(function () { oComboBox.setBusy(false); });
        },

        onCostCentreOpen: function (oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/costCentresLoaded");
            var sCompanyCode = oModel.getProperty("/companyCode");

            if (!sCompanyCode) {
                MessageToast.show("Please select an affiliate first");
                return;
            }

            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);

                this._fetchCostCentres(sCompanyCode)
                    .then(function (costCentres) {
                        if (costCentres && costCentres.length > 0) {
                            oModel.setProperty("/costCentres", costCentres);
                            oModel.setProperty("/costCentresLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function (error) { console.error("Error loading cost centres:", error); oComboBox.setBusy(false); });
            }
        },

        onInternalOrderOpen: function (oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/internalOrdersLoaded");
            var sCompanyCode = oModel.getProperty("/companyCode");

            if (!sCompanyCode) {
                MessageToast.show("Please select an affiliate first");
                return;
            }

            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);

                this._fetchInternalOrders(sCompanyCode)
                    .then(function (internalOrders) {
                        if (internalOrders && internalOrders.length > 0) {
                            oModel.setProperty("/internalOrders", internalOrders);
                            oModel.setProperty("/internalOrdersLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function (error) {
                        console.error("Error loading internal orders:", error);
                        oComboBox.setBusy(false);
                    });
            }
        },

        onWBSOpen: function (oEvent) {

            var oModel = this.getView().getModel();

            if (oModel.getProperty("/wbsLoaded")) {
                return;
            }

            var oComboBox = oEvent.getSource();

            oComboBox.setBusy(true);

            WorkflowAPI.fetchWBS()

                .then(function (aWBS) {

                    if (aWBS && aWBS.length > 0) {

                        oModel.setProperty("/wbsElements", aWBS);

                        oModel.setProperty("/wbsLoaded", true);

                    }

                })

                .catch(function (err) {

                    console.error("Error loading WBS:", err);

                })

                .finally(function () {

                    oComboBox.setBusy(false);

                });
        },

        onSalesOrderOpen: function (oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/salesOrdersLoaded");

            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);

                this._fetchSalesOrders()
                    .then(function (salesOrders) {
                        if (salesOrders && salesOrders.length > 0) {
                            oModel.setProperty("/salesOrders", salesOrders);
                            oModel.setProperty("/salesOrdersLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function (error) {
                        console.error("Error loading sales orders:", error);
                        oComboBox.setBusy(false);
                    });
            }
        },

        onSalesOrderChange: function (oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sSalesOrder = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();

            if (!oContext || !sSalesOrder) {
                return;
            }

            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();

            oComboBox.setBusy(true);

            this._fetchSalesOrderItems(sSalesOrder)
                .then(function (aItems) {
                    if (aItems && aItems.length > 0) {
                        var firstItem = aItems[0];
                        oModel.setProperty(sPath + "/salesOrderItem", firstItem.SalesOrderItem || "");
                        oModel.setProperty(sPath + "/salesOrderItems", aItems);
                    }

                    return that._fetchSegmentData(sSalesOrder);
                })
                .then(function (segmentData) {

                    if (segmentData) {

                        oModel.setProperty(
                            sPath + "/SegmentProduct",
                            segmentData.SegmentProduct || ""
                        );

                        oModel.setProperty(
                            sPath + "/segmentShip",
                            segmentData.segmentShip || ""
                        );

                        oModel.setProperty(
                            sPath + "/segmentSold",
                            segmentData.segmentSold || ""
                        );

                    } else {

                        oModel.setProperty(
                            sPath + "/SegmentProduct",
                            ""
                        );

                        oModel.setProperty(
                            sPath + "/segmentShip",
                            ""
                        );

                        oModel.setProperty(
                            sPath + "/segmentSold",
                            ""
                        );
                    }

                })
                .catch(function (error) {
                    console.error("Error loading sales order details:", error);
                    MessageToast.show("Failed to load sales order details");
                })
                .finally(function () {
                    oComboBox.setBusy(false);
                });
        },

        _fetchSegmentData: function (salesOrder) {

            if (!salesOrder) {
                return Promise.resolve(null);
            }

            return WorkflowAPI.fetchSegmentData(salesOrder)
                .then(function (segmentData) {

                    if (!segmentData) {
                        return null;
                    }

                    // ✅ IMPORTANT MAPPING FIX
                    return {
                        SegmentProduct:
                            segmentData.Product || "",

                        segmentShip:
                            segmentData.ShipToParty || "",

                        segmentSold:
                            segmentData.SoldToParty || ""
                    };

                })
                .catch(function (error) {

                    console.error(
                        "Error fetching segment data:",
                        error
                    );

                    return null;
                });
        },

        _fetchCurrencies: function () {

            return WorkflowAPI.fetchCurrencies();

        },

        _fetchBusinessPartners: function (searchTerm) {
            var oModel = this.getView().getModel();
            var sTypeOfParty = oModel.getProperty("/typeOfParty");

            if (!sTypeOfParty) {
                MessageToast.show("Please select Type of Party first");
                return Promise.resolve([]);
            }

            var endpoint = this._getBusinessPartnerEndpoint(sTypeOfParty);
            var filter = "";

            if (sTypeOfParty === "Customer") {
                filter = searchTerm
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',CustomerName)&$top=20"
                    : "?$top=20";
            } else if (sTypeOfParty === "Supplier") {
                filter = searchTerm
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',SupplierName)&$top=20"
                    : "?$top=20";
            } else {
                filter = searchTerm
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',BusinessPartnerName)&$top=20"
                    : "?$top=20";
            }

            var url = endpoint + filter;

            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(this._businessPartnerConfig.Username + ":" + this._businessPartnerConfig.Password),
                    "Accept": "application/json"
                }
            })
                .then(function (response) {
                    if (!response.ok) {
                        return [];
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data && data.d && data.d.results) {
                        if (sTypeOfParty === "Customer") {
                            return data.d.results.map(function (partner) {
                                return {
                                    key: partner.Customer || "",
                                    name: partner.CustomerName || "",
                                    fullText: (partner.Customer || "") + " - " + (partner.CustomerName || "")
                                };
                            });
                        } else if (sTypeOfParty === "Supplier") {
                            return data.d.results.map(function (partner) {
                                return {
                                    key: partner.Supplier || "",
                                    name: partner.SupplierName || "",
                                    fullText: (partner.Supplier || "") + " - " + (partner.SupplierName || "")
                                };
                            });
                        } else {
                            return data.d.results.map(function (partner) {
                                return {
                                    key: partner.BusinessPartner || "",
                                    name: partner.BusinessPartnerName || "",
                                    fullText: (partner.BusinessPartner || "") + " - " + (partner.BusinessPartnerName || "")
                                };
                            });
                        }
                    }
                    return [];
                })
                .catch(function (error) {
                    console.error("Error fetching business partners:", error);
                    return [];
                });
        },

        onSupplierSuggest: function (oEvent) {

            var sSuggestValue = oEvent.getParameter("suggestValue");
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var sTypeOfParty = oModel.getProperty("/typeOfParty");

            if (!sTypeOfParty) {
                MessageBox.warning("Please select Type of Party first");
                return;
            }

            if (!sSuggestValue || sSuggestValue.length <= 0) {
                return;
            }

            oSource.setBusy(true);

            WorkflowAPI.fetchBusinessPartners(sSuggestValue, sTypeOfParty)

                .then(function (aPartners) {

                    // APPLY FILTER ONLY FOR SUPPLIER
                    if (sTypeOfParty === "Supplier") {

                        var aAllowedSupplierGroups = [
                            "GENL",
                            "ZDPE",
                            "ZDPV",
                            "ZEXV",
                            "ZTAX",
                            "ZPI",
                            "ZLOG"
                        ];

                        aPartners = aPartners.filter(function (partner) {

                            return aAllowedSupplierGroups.includes(
                                partner.SupplierAccountGroup
                            );

                        });

                    }

                    oSource.destroySuggestionItems();

                    aPartners.forEach(function (partner) {

                        oSource.addSuggestionItem(
                            new sap.ui.core.Item({
                                key: partner.key,
                                text: partner.fullText
                            })
                        );

                    });

                })

                .catch(function (error) {

                    console.error("Error in suggestion:", error);

                })

                .finally(function () {

                    oSource.setBusy(false);

                });

        },

        onSupplierSuggestionSelected: function (oEvent) {
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

            // Set supplier name in input
            oSource.setValue(name);

            var sTypeOfParty = oModel.getProperty("/typeOfParty");

            // Set CS Number (only once)
            if (!oModel.getProperty("/csNumber")) {
                oModel.setProperty("/csNumber", supplierCustomerNumber);
            }

            if (oContext) {
                var sPath = oContext.getPath();

                // Store supplier number
                oModel.setProperty(sPath + "/supplierNumber", supplierCustomerNumber);

                oSource.setBusy(true);

                // 🚨 REMOVED: GL auto population logic
                // Now GL is controlled ONLY by Debit GL Type

                Promise.resolve()
                    .then(function () {
                        if (sTypeOfParty === "Supplier") {
                            return WorkflowAPI.fetchPurchaseOrders(supplierCustomerNumber);
                        }
                        return [];
                    })
                    .then(function (aPurchaseOrders) {
                        if (sTypeOfParty === "Supplier") {

                            // Filter out completed POs
                            var aFiltered = aPurchaseOrders.filter(function (po) {
                                return po.PurchasingCompletenessStatus !== true &&
                                    po.PurchasingCompletenessStatus !== "true";
                            });

                            oModel.setProperty(sPath + "/purchaseOrders", aFiltered);
                        }
                    })
                    .catch(function (error) {
                        console.error("Error in supplier selection:", error);
                    })
                    .finally(function () {
                        oSource.setBusy(false);
                    });
            }
        },

        onGLAccountSuggest: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var aGLAccounts = oModel.getProperty("/glAccounts");

            if (!aGLAccounts || aGLAccounts.length === 0) {
                var sCompanyCode = oModel.getProperty("/companyCode");
                if (sCompanyCode) {
                    oSource.setBusy(true);
                    this._fetchGLAccounts(sCompanyCode)
                        .then(function (glAccounts) {
                            if (glAccounts && glAccounts.length > 0) {
                                oModel.setProperty("/glAccounts", glAccounts);
                                oModel.setProperty("/glAccountsLoaded", true);

                                oSource.destroySuggestionItems();
                                glAccounts.forEach(function (account) {
                                    oSource.addSuggestionItem(
                                        new sap.ui.core.Item({
                                            key: account.GLAccount,
                                            text: account.displayText
                                        })
                                    );
                                });
                            }
                            oSource.setBusy(false);
                        })
                        .catch(function (error) {
                            console.error("Error loading GL accounts:", error);
                            oSource.setBusy(false);
                        });
                } else {
                    MessageToast.show("Please select an affiliate first");
                }
            }
        },

        _validateHeaderFields: function () {
            var bValid = true;
            var aRequiredFields = [
                { id: "Copy_affiliateSelect", name: "Affiliate" },
                { id: "Copy_nameAccrualInput", name: "Name your accrual" },
                { id: "Copy_cutoffDatePicker", name: "Accrual cut-off date" },
                { id: "Copy_companyCodeInput", name: "Company code" },
                { id: "Copy_requestedByInput", name: "Requested by" },
                //{ id: "Copy_approvedByInput", name: "Approved by" },
                { id: "Copy_typeOfRequestSelect", name: "Type of request" },
                { id: "Copy_requestTypeSelect", name: "Type of Accrual" },
                { id: "Copy_typeOfPartySelect", name: "Type of Party" },

            ];

            var sTypeOfRequest = this.getView().getModel().getProperty("/typeOfRequest");

            aRequiredFields.forEach(function (field) {

                //Skip Type of Accrual validation for Reclass
                if (field.id === "accrualTypeSelect" && sTypeOfRequest === "Reclass") {
                    return;
                }

                var oControl = this.byId(field.id);

                if (!oControl) {
                    console.error("Control not found for ID: " + field.id);
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
            var oApprovedBy = this.byId("Copy_approvedByInput");

            if (oApprovedBy) {
                oApprovedBy.setValueState("None");
                oApprovedBy.setValueStateText("");
            }
            return bValid;
        },


        _validateExcludeTaxValue: function (sPath, sValue) {

            var oModel = this.getView().getModel();

            // Reset state
            oModel.setProperty(sPath + "/excludeTaxState", "None");
            oModel.setProperty(sPath + "/excludeTaxStateText", "");

            if (!sValue || sValue.toString().trim() === "") return;

            var fValue = parseFloat(sValue);
            var fPONetAmount = parseFloat(oModel.getProperty(sPath + "/poNetAmount"));

            // ✅ Validate number
            if (isNaN(fValue)) {
                oModel.setProperty(sPath + "/excludeTaxState", "Error");
                oModel.setProperty(sPath + "/excludeTaxStateText", "Must be a valid number");
                return;
            }

            // ❌ REMOVED: 5000 validation (as per new requirement)

            // ✅ Validate against PO amount
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
        },



        _validateTableItems: function () {
            var bValid = true;
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");

            if (aItems.length === 0) {
                MessageBox.error("At least one line item is required");
                return false;
            }

            var sRequestType = oModel.getProperty("/requestType");
            if (sRequestType === "Reclass" && aItems.length > 2) {
                MessageBox.error("Reclass request can have a maximum of 2 line items only.");
                return false;
            }

            var aRequiredFields = [
                { field: "supplier", label: "Supplier/Customer" },
                { field: "description", label: "Description" },
                { field: "currency", label: "Currency" },
                { field: "excludeTax", label: "Exclude Tax" },
                { field: "glAccount", label: "GL Account Code" },
                { field: "creditDebit", label: "Credit/Debit Indicator" }
            ];

            aItems.forEach(function (item, index) {
                aRequiredFields.forEach(function (reqField) {
                    var sValue = item[reqField.field];
                    var sStateProp = reqField.field + "State";
                    var sStateTextProp = reqField.field + "StateText";

                    if (!sValue || sValue.toString().trim() === "") {
                        item[sStateProp] = "Error";
                        item[sStateTextProp] = reqField.label + " is required";
                        bValid = false;
                    } else {
                        item[sStateProp] = "None";
                        item[sStateTextProp] = "";
                    }
                });

                if (item.excludeTax && isNaN(item.excludeTax)) {
                    item.excludeTaxState = "Error";
                    item.excludeTaxStateText = "Must be a valid number";
                    bValid = false;
                }
            });

            oModel.setProperty("/items", aItems);
            return bValid;
        },

        _validateCutoffDate: function () {
            var oDatePicker = this.byId("Copy_cutoffDatePicker");
            var sDate = oDatePicker.getValue();

            var dateRegex = /^\d{8}$/;

            if (!dateRegex.test(sDate)) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Date must be in format yyyymmdd");
                return false;
            }

            var year = parseInt(sDate.substring(0, 4));
            var month = parseInt(sDate.substring(4, 6));
            var day = parseInt(sDate.substring(6, 8));

            var date = new Date(year, month - 1, day);

            if (date.getFullYear() !== year ||
                date.getMonth() !== month - 1 ||
                date.getDate() !== day) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Invalid date");
                return false;
            }

            var lastDayOfMonth = new Date(year, month, 0).getDate();

            if (day !== lastDayOfMonth) {
                oDatePicker.setValueState("Error");
                oDatePicker.setValueStateText("Must be a month-end date. Last day is " + lastDayOfMonth);
                return false;
            }

            oDatePicker.setValueState("None");
            return true;
        },

        _preparePayloadForProcessAutomation: function (oData, iStatus) {
            var oModel = this.getView().getModel();

            var totalExcludeTax = oModel.getProperty("/totalExcludeTax") || 0;
            var totalUSD = oModel.getProperty("/totalUSD") || 0;
            var payload = {
                definitionId: "us10.e84e1793trial.infineumaccrual4.accrual_Process",
                context: {
                    accrual: {
                        Affiliate: oData.affiliate || "",
                        CompanyCode: oData.companyCode || "",
                        NameYourAccrual: oData.nameAccrual || "",
                        RequestedBy: oData.requestedBy || "",
                        ApprovedBy: oData.approvedBy || "",
                        AccrualCutOffDate: oData.cutoffDate || "",
                        //TYPE OF ACCRUAL (Commission / Rebate / Adhoc / Technology)
                        TypeofRequest: oData.requestType || oData.accrualType || "",
                        typeOfRequest: oData.requestType || oData.accrualType || "",

                        //TYPE OF REQUEST (Accrual / Reclass) — clearly separate
                        Requesttype: oData.typeOfRequest || "",
                        requestType: oData.typeOfRequest || "",
                        typeOfRequest_1: oData.typeOfRequest || "",
                        Partytype: oData.typeOfParty || "",
                        CSNumber: oData.csNumber || "",
                        CostCenterOwner: (oData.costCenterOwnerEmails || [])
                            .map(function (o) { return o.email; })
                            .join(","),
                        debitGLType: oData.debitGLType,
                        Createddate: this._getCurrentDateFormatted(),  // NEW FIELD
                        Status: iStatus.toString(),
                        Supporting_Documents: oData.dmsFolderId
                            ? "spa-res:cmis:folderid:" + oData.dmsFolderId
                            : "",
                        TotalAmount: totalUSD.toString(),
                        Total_Exclude_Tax: totalExcludeTax.toString(),
                        Accrual_Table: oData.items.map(function (item, index) {
                            var cdIndicator = "";
                            if (item.creditDebit === "Debit") {
                                cdIndicator = "D";
                            } else if (item.creditDebit === "Credit") {
                                cdIndicator = "C";
                            }

                            return {
                                ItemnoAcc: (index + 1).toString(),
                                SupplierCustomer: item.supplier || "",
                                Description: item.description || "",
                                Currency: item.currency || "",
                                ExcludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                                gLAccountCode: item.glAccount ? item.glAccount.split(" - ")[0].trim() : "",
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
                                SegmentSoldtoParty: item.segmentSold || "",
                                materialNumber: item.materialNumber || "",
                                countryRegionKey: item.countryRegionKey || ""
                            };
                        })
                    }
                }
            };

            return payload;
        },


        onSubmit: function () {

            var that = this;

            var bHeaderValid = this._validateHeaderFields();
            var bDateValid = this._validateCutoffDate();
            var bTableValid = this._validateTableItems();
            var bDocValid = this._validateSupportingDocuments();

            if (!bHeaderValid || !bDateValid || !bTableValid || !bDocValid) {
                return;
            }

            var oModel = this.getView().getModel();
            var oData = oModel.getData();

            // NEW VALIDATION
            var totalUSD = parseFloat(
                oModel.getProperty("/totalUSD")
            ) || 0;

            if (totalUSD < 5000) {

                MessageBox.error(
                    "Total USD amount must be greater than or equal to 5,000 USD for submission."
                );

                return;
            }

            oData.typeOfRequest = oModel.getProperty("/typeOfRequest");

            // ADD THIS LINE
            oData.debitGLType = oModel.getProperty("/glType");

            sap.ui.core.BusyIndicator.show(0);

            var workflowInstanceId = null;

            WorkflowAPI.triggerWorkflow(
                this._preparePayloadForProcessAutomation(oData, 1)
            )

                .then(function (result) {

                    console.log("Workflow created successfully:", result);

                    workflowInstanceId = result.id;

                    if (!workflowInstanceId) {
                        throw new Error("Workflow created but no instance ID returned");
                    }

                    return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId, 10, 3000);
                })

                .then(function (taskInstanceId) {

                    if (!taskInstanceId) {
                        throw new Error("No READY form found after workflow creation");
                    }

                    console.log("Found READY task instance:", taskInstanceId);

                    return WorkflowAPI.patchTaskInstance(
                        taskInstanceId,
                        that._preparePayloadForPatch(oData, 1)
                    );
                })

                .then(function () {

                    sap.ui.core.BusyIndicator.hide();

                    MessageBox.success(
                        "Request submitted successfully!",
                        {
                            onClose: function () {
                                that.getOwnerComponent().getRouter().navTo("Dashboard");
                            }
                        }
                    );
                })

                .catch(function (error) {

                    sap.ui.core.BusyIndicator.hide();

                    console.error("Submit workflow error:", error);

                    MessageBox.error("Failed to submit request:\n\n" + error.message);
                });
        },

        onSaveAsDraft: async function () {
            await this._convertToUSD();
            var that = this;
            var bDocValid = this._validateSupportingDocuments();


            if (!this._validateHeaderFields() ||
                !this._validateCutoffDate() ||
                !this._validateTableItems() ||
                !bDocValid) {

                MessageBox.error("Please fill in all required fields correctly");
                return;
            }

            var oModel = this.getView().getModel();
            var oData = oModel.getData();

            oData.typeOfRequest = oModel.getProperty("/typeOfRequest");

            // ADD THIS LINE
            oData.debitGLType = oModel.getProperty("/glType");

            sap.ui.core.BusyIndicator.show(0);

            var workflowInstanceId = null;

            WorkflowAPI.triggerWorkflow(
                this._preparePayloadForProcessAutomation(oData, 2)
            )

                .then(function (result) {

                    workflowInstanceId = result.id;

                    if (!workflowInstanceId) {
                        throw new Error("Workflow created but no instance ID returned");
                    }

                    return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId, 10, 3000);

                })

                .then(function (taskInstanceId) {

                    if (!taskInstanceId) {
                        throw new Error("No READY form found after workflow creation");
                    }

                    return WorkflowAPI.patchTaskInstance(
                        taskInstanceId,
                        that._preparePayloadForPatch(oData, 2)
                    );

                })

                .then(function () {

                    sap.ui.core.BusyIndicator.hide();

                    MessageBox.success("Request saved as draft successfully!", {
                        onClose: function () {
                            that.getOwnerComponent().getRouter().navTo("Dashboard");
                        }
                    });

                })

                .catch(function (error) {

                    sap.ui.core.BusyIndicator.hide();

                    console.error("Save as Draft workflow error:", error);

                    MessageBox.error("Failed to save draft:\n\n" + error.message);

                });
        },


        onDMSFileSelected: function (oEvent) {

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
                .then(function (token) {
                    sToken = token;

                    var sFolderId = oModel.getProperty("/dmsFolderId");

                    //Skip folder creation if already exists
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
                .then(function (r) {

                    if (r && r.skipCreate) return r;

                    if (!r.ok) throw new Error("Create folder failed: " + r.status);
                    return r.json();
                })
                .then(function (data) {

                    if (!data.skipCreate) {
                        var objectId = data?.succinctProperties?.["cmis:objectId"];
                        oModel.setProperty("/dmsFolderId", objectId);
                    }

                    var uploadUrl = ep.createDocument + "/" + encodeURIComponent(sFolderName);

                    //MULTIPLE FILE UPLOAD WITH UNIQUE NAME
                    return Promise.all(
                        Array.from(aFiles).map(function (oFile) {

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
                                .then(function (r) {
                                    if (!r.ok) {
                                        throw new Error("Upload failed: " + r.status);
                                    }
                                    return r.json();
                                })
                                .then(function (res) {
                                    return {
                                        objectId: res?.succinctProperties?.["cmis:objectId"] || "temp_id",
                                        fileName: oFile.name, //show original name in UI
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
                .then(function (aResults) {

                    //APPEND (not overwrite)
                    var aDocs = oModel.getProperty("/dmsDocuments") || [];

                    aResults.forEach(function (doc) {
                        aDocs.push(doc);
                    });

                    oModel.setProperty("/dmsDocuments", aDocs);

                    MessageToast.show(aResults.length + " file(s) uploaded successfully");
                })
                .catch(function (error) {
                    console.error("DMS Upload error:", error);
                    MessageBox.error("Upload failed: " + error.message);
                })
                .finally(function () {
                    sap.ui.core.BusyIndicator.hide();
                    oFileUploader.clear();
                });
        },



        onClear: function () {
            var that = this;
            var sEmail = this._getEmailFromURL();

            MessageBox.confirm("Are you sure you want to clear the form?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var oModel = that.getView().getModel();
                        var aCompanyCodes = oModel.getProperty("/companyCodes");
                        var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
                        var bLoaded = oModel.getProperty("/companyCodesLoaded");
                        var aSalesOrders = oModel.getProperty("/salesOrders");
                        var bSalesOrdersLoaded = oModel.getProperty("/salesOrdersLoaded");
                        var aCurrencies = oModel.getProperty("/currencies");
                        var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");

                        var oNewModel = new JSONModel({
                            affiliate: "",
                            nameAccrual: "",
                            cutoffDate: "",
                            companyCode: "",
                            requestedBy: sEmail || "",
                            approvedBy: "",
                            typeOfRequest: "",
                            requestType: "",
                            typeOfParty: "",
                            csNumber: "",
                            selectedItemsCount: 0,
                            currency: "",
                            dmsDocuments: [],
                            dmsFolderId: "",
                            costCenterOwner: "",
                            costCenterOwnerEmails: [],
                            items: [
                                that._createEmptyItem()
                            ],
                            companyCodes: aCompanyCodes || [],
                            affiliateToCompanyCodeMap: oMapping || {},
                            companyCodesLoaded: bLoaded || false,
                            glAccounts: [],
                            glAccountsLoaded: false,
                            costCentres: [],
                            costCentresLoaded: false,
                            internalOrders: [],
                            internalOrdersLoaded: false,
                            salesOrders: aSalesOrders || [],
                            salesOrdersLoaded: bSalesOrdersLoaded || false,
                            currencies: aCurrencies || [],
                            currenciesLoaded: bCurrenciesLoaded || false,
                            materialNumber: "",
                            countryRegionKey: "",
                        });

                        that.getView().setModel(oNewModel);
                        that._clearValueStates();

                        var oTable = that.byId("itemsTable");
                        oTable.removeSelections(true);

                        MessageToast.show("Form cleared");
                    }
                }
            });
        },

        _clearValueStates: function () {
            var aRequiredFields = [
                "Copy_affiliateSelect", "Copy_nameAccrualInput", "Copy_cutoffDatePicker",
                "Copy_companyCodeInput", "Copy_requestedByInput", "Copy_approvedByInput",
                "Copy_typeOfRequestSelect", "Copy_requestTypeSelect", "Copy_typeOfPartySelect"
            ];

            aRequiredFields.forEach(function (sFieldId) {
                var oControl = this.byId(sFieldId);
                if (oControl) {
                    oControl.setValueState("None");
                    oControl.setValueStateText("");
                }
            }, this);
        },

        //------reclass


        onTypeOfRequestChange: function (oEvent) {

            var oModel = this.getView().getModel();
            var sType = oEvent.getSource().getSelectedKey();
            var aItems = oModel.getProperty("/items") || [];

            if (sType === "Reclass") {

                // Max 2 rows
                if (aItems.length > 2) {
                    aItems = aItems.slice(0, 2);
                }

                if (aItems.length === 1) {
                    aItems.push(this._createEmptyItem());
                }

                // Set Debit/Credit
                if (aItems.length >= 2) {
                    aItems[0].creditDebit = "Debit";
                    aItems[1].creditDebit = "Credit";
                }

                oModel.setProperty("/items", aItems);

                MessageToast.show("Reclass → Only 2 rows allowed");

            }
        },



        _refreshForm: function () {
            var sEmail = this._getEmailFromURL();
            var sMonthEndDate = this._getCurrentMonthEndDate();

            var oModel = this.getView().getModel();
            var aCompanyCodes = oModel.getProperty("/companyCodes");
            var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
            var bLoaded = oModel.getProperty("/companyCodesLoaded");
            var aSalesOrders = oModel.getProperty("/salesOrders");
            var bSalesOrdersLoaded = oModel.getProperty("/salesOrdersLoaded");
            var aCurrencies = oModel.getProperty("/currencies");
            var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");


            var oNewModel = new JSONModel({
                affiliate: "",
                nameAccrual: "",
                cutoffDate: sMonthEndDate,
                companyCode: "",
                requestedBy: sEmail || "",
                approvedBy: "",
                requestType: "",
                typeOfParty: "",
                csNumber: "",
                selectedItemsCount: 0,
                currency: "",
                dmsDocuments: [],
                dmsFolderId: "",
                costCenterOwner: "",
                costCenterOwnerEmails: [],
                items: [
                    this._createEmptyItem()
                ],
                companyCodes: aCompanyCodes || [],
                affiliateToCompanyCodeMap: oMapping || {},
                companyCodesLoaded: bLoaded || false,
                glAccounts: [],
                glAccountsLoaded: false,
                costCentres: [],
                costCentresLoaded: false,
                internalOrders: [],
                internalOrdersLoaded: false,
                salesOrders: aSalesOrders || [],
                salesOrdersLoaded: bSalesOrdersLoaded || false,
                currencies: aCurrencies || [],
                currenciesLoaded: bCurrenciesLoaded || false
            });

            this.getView().setModel(oNewModel);
            this._clearValueStates();

            var oTable = this.byId("itemsTable");
            if (oTable) {
                oTable.removeSelections(true);
            }

            window.scrollTo(0, 0);

            console.log("Form refreshed successfully");
        }
    });
});