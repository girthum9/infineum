sap.ui.define([
    "sap/base/Log",
    "accrual/config/AppConfig"
], function (Log, AppConfig) {
    "use strict";

    return {

    // ─── CONFIGS FROM APPCONFIG ─────────────────────────────────────────────

    _workflowLogsConfig: AppConfig.workflowLogs,

    _processAutomationConfig: AppConfig.processAutomation,

    _instanceConfig: AppConfig.instance,

    _taskInstanceConfig: AppConfig.taskInstance,

    _businessPartnerConfig: AppConfig.businessPartner,

    _companyCodeConfig: AppConfig.companyCode,

    _glAccountConfig: AppConfig.glAccount,

    _purchaseOrderConfig: AppConfig.purchaseOrder,

    _purchaseOrderItemConfig: AppConfig.purchaseOrderItem,

    _costCentreConfig: AppConfig.costCentre,

    _internalOrderConfig: AppConfig.internalOrder,

    _salesOrderConfig: AppConfig.salesOrder,

    _currencyConfig: AppConfig.currency,

    _segmentConfig: AppConfig.segment,

    _dashboardConfig: AppConfig.dashboard,

    _dmsConfig: AppConfig.dms,

        // ─── SHARED HELPER ───────────────────────────────────────────────────────────

        _getAuthHeader: function (username, password) {
            return "Basic " + btoa(username + ":" + password);
        },

        // ───────────── DASHBOARD APIs ─────────────

    fetchAccrualRequests: function () {

        var cfg = this._dashboardConfig;

        return fetch(cfg.accrualApiEndpoint, {
            method: "GET",
            headers: {
                "Authorization": this._getAuthHeader(cfg.username, cfg.password),
                "Accept": "application/json"
            }
        })
        .then(function (response) {

            if (!response.ok) {
                throw new Error("Failed to fetch accrual requests: " + response.status);
            }

            return response.json();
        });
    },

    recallWorkflowInstance: function (instanceId) {

        var cfg = this._dashboardConfig;

        return fetch(cfg.recallApiEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                instanceId: instanceId
            })
        })
        .then(function (response) {

            if (!response.ok) {
                throw new Error("Recall failed: " + response.status);
            }

            return response;
        });
    },

    // ─── VIEW DETAILS API ─────────────────────────────────────────────────────────────

     fetchWorkflowContext: function (instanceId) {

    var url =
        this._instanceConfig.baseEndpoint +
        "/" +
        instanceId +
        "/context";

    return fetch(url, {
        method: "GET",
        headers: {
            "Authorization": this._getAuthHeader(
                this._instanceConfig.username,
                this._instanceConfig.password
            ),
            "Accept": "application/json"
        }
    })
    .then(function (response) {

        if (!response.ok) {
            throw new Error("Failed to fetch workflow context: " + response.status);
        }

        return response.json();

    });
},

// ─── Workflow instance ─────────────────────────────────────────────────────────────

fetchWorkflowInstanceContext: function (instanceId) {

    var cfg = this._instanceConfig;

    var url = cfg.baseEndpoint + "/" + instanceId + "/context";

    return fetch(url, {
        method: "GET",
        headers: {
            "Authorization": this._getAuthHeader(cfg.username, cfg.password),
            "Accept": "application/json"
        }
    })
    .then(function (response) {

        if (!response.ok) {
            throw new Error("Failed to fetch workflow instance context: " + response.status);
        }

        return response.json();

    });

},

getBusinessPartnerEndpoint: function(typeOfParty) {

    var baseUrl = this._businessPartnerConfig.baseEndpoint;

    if (typeOfParty === "Customer") {
        return baseUrl + "/A_Customer";
    }

    if (typeOfParty === "Supplier") {
        return baseUrl + "/A_Supplier";
    }

    return baseUrl + "/A_BusinessPartner";

},


        // ─── DATE HELPER ─────────────────────────────────────────────────────────────

        parseSAPDate: function (sapDate) {
            if (!sapDate) return null;
            try {
                var match = /Date\((\d+)\)/.exec(sapDate);
                if (!match) return null;
                var oDate = new Date(parseInt(match[1], 10));
                return isNaN(oDate.getTime()) ? null : oDate;
            } catch (error) {
                Log.error("WorkflowAPI: Error parsing SAP date:", error);
                return null;
            }
        },

        // ─── WORKFLOW LOGS ───────────────────────────────────────────────────────────

        fetchWorkflowLogs: async function (instanceId) {
            if (!instanceId) throw new Error("Instance ID is required");

            var url = this._workflowLogsConfig.baseUrl + "/WorkflowSet?$filter=Instanceid eq '" + instanceId + "'";

            try {
                var response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Authorization": this._getAuthHeader(this._workflowLogsConfig.username, this._workflowLogsConfig.password),
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    }
                });

                if (!response.ok) throw new Error("HTTP Error: " + response.status + " - " + response.statusText);

                var data = await response.json();

                if (data && data.d && data.d.results) {
                    return data.d.results.map(function (entry) {
                        return {
                            Instanceid: entry.Instanceid,
                            Logdate: this.parseSAPDate(entry.Zdate),
                            Role: entry.Role,
                            Email: entry.Email,
                            Name: entry.Name,
                            Action: entry.Action,
                            Comments: entry.Commment || ""
                        };
                    }.bind(this));
                }
                return [];
            } catch (error) {
                Log.error("WorkflowAPI: Error fetching workflow logs:", error);
                throw error;
            }
        },

        // ─── WORKFLOW INSTANCE ───────────────────────────────────────────────────────

        fetchInstanceData: function (instanceId) {
            var url = this._instanceConfig.baseEndpoint + "/" + instanceId + "/context";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._instanceConfig.username, this._instanceConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (response) {
                if (!response.ok) throw new Error("Failed to fetch instance data: " + response.status);
                return response.json();
            });
        },

        getTaskInstanceByWorkflowId: function (workflowInstanceId, maxRetries, retryDelay) {
            var that = this;
            maxRetries = maxRetries || 10;
            retryDelay = retryDelay || 2000;
            var currentRetry = 0;

            var attempt = function () {
                var url = that._taskInstanceConfig.baseEndpoint + "?workflowInstanceId=" + workflowInstanceId;

                return fetch(url, {
                    method: "GET",
                    headers: {
                        "Authorization": that._getAuthHeader(that._taskInstanceConfig.username, that._taskInstanceConfig.password),
                        "Accept": "application/json"
                    }
                })
                .then(function (response) {
                    if (!response.ok) throw new Error("Failed to fetch task instances: " + response.status);
                    return response.json();
                })
                .then(function (data) {
                    if (Array.isArray(data)) {
                        var readyForm = data.find(function (task) {
                            return task.activityId === "form_accrualSubmissionForm_2" && task.status === "READY";
                        });
                        if (readyForm) return readyForm.id;
                    }

                    currentRetry++;
                    if (currentRetry < maxRetries) {
                        return new Promise(function (resolve) {
                            setTimeout(function () { resolve(attempt()); }, retryDelay);
                        });
                    }
                    throw new Error("No READY form found after " + maxRetries + " attempts");
                });
            };

            return attempt();
        },

        patchTaskInstance: function (taskInstanceId, payload) {
            var url = this._taskInstanceConfig.baseEndpoint + "/" + taskInstanceId;

            return fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": this._getAuthHeader(this._taskInstanceConfig.username, this._taskInstanceConfig.password),
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })
            .then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (text) {
                        throw new Error("PATCH failed (" + response.status + "): " + text);
                    });
                }
                return response.text().then(function (text) {
                    if (!text || text.trim() === "") return { success: true };
                    try { return JSON.parse(text); } catch (e) { return { success: true, response: text }; }
                });
            });
        },

        getAccessToken: function () {
            var config = this._processAutomationConfig.uaaConfig;
            return fetch(config.url + "/oauth/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + btoa(config.clientId + ":" + config.clientSecret)
                },
                body: "grant_type=client_credentials"
            })
            .then(function (response) {
                if (!response.ok) throw new Error("Failed to get access token: " + response.status);
                return response.json();
            })
            .then(function (data) { return data.access_token; });
        },

        triggerWorkflow: function (payload) {
    var that = this;
    return this.getAccessToken()
        .then(function (token) {
            return fetch(that._processAutomationConfig.apiEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify(payload)
            });
        })
        .then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    throw new Error("Workflow trigger failed: " + response.status + "\n" + text);
                });
            }
            return response.json();
        });
},

        // ─── MASTER DATA ─────────────────────────────────────────────────────────────

        fetchCompanyCodes: function () {
            return fetch(this._companyCodeConfig.apiEndpoint, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._companyCodeConfig.username, this._companyCodeConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) { return data.d && data.d.results ? data.d.results : []; });
        },

                searchSupplierByName: function (supplierName, typeOfParty) {
            if (!supplierName || !typeOfParty) return Promise.resolve(null);
            var endpoint = this.getBusinessPartnerEndpoint(typeOfParty);
            var filter = typeOfParty === "Customer"
                ? "?$filter=CustomerName eq '" + encodeURIComponent(supplierName) + "'&$top=1"
                : "?$filter=SupplierName eq '" + encodeURIComponent(supplierName) + "'&$top=1";

            return fetch(endpoint + filter, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._businessPartnerConfig.username, this._businessPartnerConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    return typeOfParty === "Customer"
                        ? data.d.results[0].Customer || null
                        : data.d.results[0].Supplier || null;
                }
                return null;
            })
            .catch(function () { return null; });
        },

        fetchGLAccounts: function (companyCode) {
            if (!companyCode) return Promise.resolve([]);
            var url = this._glAccountConfig.apiEndpoint + "?$filter=CompanyCode eq '" + companyCode + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._glAccountConfig.username, this._glAccountConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (a) {
                    return {
                        GLAccount: a.GLAccount || "",
                        GLAccountName: a.GLAccountName || "",
                        displayText: (a.GLAccount || "") + " - " + (a.GLAccountName || "")
                    };
                });
            });
        },

        fetchCostCentres: function (companyCode) {
            if (!companyCode) return Promise.resolve([]);
            var url = this._costCentreConfig.apiEndpoint + "?$filter=CompanyCode eq '" + companyCode + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._costCentreConfig.username, this._costCentreConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (cc) { return { CostCenter: cc.CostCenter || "" }; });
            });
        },

        fetchCurrencyFromCostCenter: function (companyCode) {
            if (!companyCode) return Promise.resolve(null);
            var url = this._costCentreConfig.apiEndpoint + "?$filter=CompanyCode eq '" + companyCode + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._costCentreConfig.username, this._costCentreConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    return data.d.results[0].CostCenterCurrency || null;
                }
                return null;
            })
            .catch(function () { return null; });
        },

        fetchApproverEmailFromCostCenter: function (costCenter) {
            if (!costCenter) return Promise.resolve(null);
            var url = this._costCentreConfig.apiEndpoint + "?$filter=CostCenter eq '" + costCenter + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._costCentreConfig.username, this._costCentreConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    return data.d.results[0].AddressName || null;
                }
                return null;
            })
            .catch(function () { return null; });
        },

        fetchInternalOrders: function (companyCode) {
            if (!companyCode) return Promise.resolve([]);
            var url = this._internalOrderConfig.apiEndpoint + "?$filter=CompanyCode eq '" + companyCode + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._internalOrderConfig.username, this._internalOrderConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (io) {
                    return {
                        OrderNumber: io.OrderNumber || "",
                        OrderDescription: io.OrderDescription || "",
                        displayText: (io.OrderNumber || "") + (io.OrderDescription ? " - " + io.OrderDescription : "")
                    };
                });
            });
        },

        fetchPurchaseOrders: function (supplierNumber) {
            if (!supplierNumber) return Promise.resolve([]);
            var url = this._purchaseOrderConfig.apiEndpoint + "?$filter=Supplier eq '" + supplierNumber + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._purchaseOrderConfig.username, this._purchaseOrderConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (po) { return { PurchaseOrder: po.PurchaseOrder || "" }; });
            });
        },

        fetchPurchaseOrderItems: function (purchaseOrder) {
            if (!purchaseOrder) return Promise.resolve([]);
            var url = this._purchaseOrderItemConfig.apiEndpoint + "?$filter=PurchaseOrder eq '" + purchaseOrder + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._purchaseOrderItemConfig.username, this._purchaseOrderItemConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (item) {
                    return {
                        PurchaseOrderItem: item.PurchaseOrderItem || "",
                        PurchaseOrderItemText: item.PurchaseOrderItemText || "",
                        NetAmount: item.NetAmount || "0.00",
                        displayText: (item.PurchaseOrderItem || "") + (item.PurchaseOrderItemText ? " - " + item.PurchaseOrderItemText : "")
                    };
                });
            });
        },

        fetchSalesOrders: function () {
            return fetch(this._salesOrderConfig.apiEndpoint, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._salesOrderConfig.username, this._salesOrderConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                var oUnique = {};
                data.d.results.forEach(function (item) {
                    if (item.SalesOrder) oUnique[item.SalesOrder] = true;
                });
                return Object.keys(oUnique).map(function (so) {
                    return { SalesOrder: so };
                }).sort(function (a, b) { return a.SalesOrder.localeCompare(b.SalesOrder); });
            });
        },

        fetchSalesOrderItems: function (salesOrder) {
            if (!salesOrder) return Promise.resolve([]);
            var url = this._salesOrderConfig.apiEndpoint + "?$filter=SalesOrder eq '" + salesOrder + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._salesOrderConfig.username, this._salesOrderConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) { return data.d && data.d.results ? data.d.results : []; });
        },

        fetchCurrencies: function () {
            return fetch(this._currencyConfig.apiEndpoint, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._currencyConfig.username, this._currencyConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                var oUnique = {};
                data.d.results.forEach(function (c) { if (c.CurrencyISOCode) oUnique[c.CurrencyISOCode] = true; });
                return Object.keys(oUnique).map(function (code) {
                    return { CurrencyISOCode: code };
                }).sort(function (a, b) { return a.CurrencyISOCode.localeCompare(b.CurrencyISOCode); });
            });
        },

        fetchSegmentData: function (salesOrder) {
            if (!salesOrder) return Promise.resolve(null);
            var url = this._segmentConfig.apiEndpoint + "?$filter=SalesOrder eq '" + salesOrder + "'";
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._segmentConfig.username, this._segmentConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    var s = data.d.results[0];
                    return { Product: s.Product || "", ShipToParty: s.ShipToParty || "", SoldToParty: s.SoldToParty || "" };
                }
                return null;
            })
            .catch(function () { return null; });
        },

        // ─── BUSINESS PARTNER ────────────────────────────────────────────────────────

        getBusinessPartnerEndpoint: function (typeOfParty) {
            var base = this._businessPartnerConfig.baseEndpoint;
            if (typeOfParty === "Customer") return base + "/A_Customer";
            if (typeOfParty === "Supplier") return base + "/A_Supplier";
            return base + "/A_BusinessPartner";
        },

        fetchBusinessPartners: function (searchTerm, typeOfParty) {
            if (!typeOfParty) return Promise.resolve([]);
            var endpoint = this.getBusinessPartnerEndpoint(typeOfParty);
            var filter = "";

            if (typeOfParty === "Customer") {
                filter = searchTerm ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',CustomerName)&$top=20" : "?$top=20";
            } else if (typeOfParty === "Supplier") {
                filter = searchTerm ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',SupplierName)&$top=20" : "?$top=20";
            } else {
                filter = searchTerm ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',BusinessPartnerName)&$top=20" : "?$top=20";
            }

            return fetch(endpoint + filter, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._businessPartnerConfig.username, this._businessPartnerConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : { d: { results: [] } }; })
            .then(function (data) {
                if (!data.d || !data.d.results) return [];
                return data.d.results.map(function (p) {
                    if (typeOfParty === "Customer") return { key: p.Customer || "", name: p.CustomerName || "", fullText: (p.Customer || "") + " - " + (p.CustomerName || "") };
                    if (typeOfParty === "Supplier") return { key: p.Supplier || "", name: p.SupplierName || "", fullText: (p.Supplier || "") + " - " + (p.SupplierName || "") };
                    return { key: p.BusinessPartner || "", name: p.BusinessPartnerName || "", fullText: (p.BusinessPartner || "") + " - " + (p.BusinessPartnerName || "") };
                });
            });
        },


        fetchGLAccountForSupplierCustomer: function (supplierCustomerNumber, typeOfParty, companyCode) {
            if (!companyCode) return Promise.resolve(null);
            var endpoint = typeOfParty === "Supplier"
                ? this._businessPartnerConfig.baseEndpoint + "/A_Supplier('" + supplierCustomerNumber + "')/to_SupplierCompany"
                : this._businessPartnerConfig.baseEndpoint + "/A_Customer('" + supplierCustomerNumber + "')/to_CustomerCompany";

            return fetch(endpoint, {
                method: "GET",
                headers: {
                    "Authorization": this._getAuthHeader(this._businessPartnerConfig.username, this._businessPartnerConfig.password),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    var match = data.d.results.find(function (i) { return i.CompanyCode === companyCode; });
                    return match ? match.ReconciliationAccount : data.d.results[0].ReconciliationAccount;
                }
                return null;
            })
            .catch(function () { return null; });
        },

        // ─── DMS ─────────────────────────────────────────────────────────────────────

        getDMSToken: function () {
            var cfg = this._dmsConfig;
            var params = new URLSearchParams();
            params.append("grant_type", "client_credentials");
            params.append("client_id", cfg.clientId);
            params.append("client_secret", cfg.clientSecret);

            return fetch(cfg.tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params
            })
            .then(function (r) { if (!r.ok) throw new Error("DMS token failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (data.access_token) return data.access_token;
                throw new Error("No access token in DMS response");
            });
        },

        createDMSFolder: function (folderName) {
            var ep = this._dmsConfig.endpoints();
            return this.getDMSToken().then(function (token) {
                var formData = new FormData();
                formData.append("cmisaction", "createFolder");
                formData.append("propertyId[0]", "cmis:objectTypeId");
                formData.append("propertyValue[0]", "cmis:folder");
                formData.append("propertyId[1]", "cmis:name");
                formData.append("propertyValue[1]", folderName);
                formData.append("succinct", "true");

                return fetch(ep.createFolder, {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token },
                    body: formData
                })
                .then(function (r) { if (!r.ok) throw new Error("Create folder failed: " + r.status); return r.json(); })
                .then(function (data) {
                    var objectId = data && data.succinctProperties && data.succinctProperties["cmis:objectId"];
                    if (!objectId) throw new Error("cmis:objectId not found in response");
                    return { objectId: objectId, folderName: folderName };
                });
            });
        },

        getDMSFolderDetails: function (folderId) {
            var ep = this._dmsConfig.endpoints();
            return this.getDMSToken()
                .then(function (token) {
                    return fetch(ep.download, {
                        method: "GET",
                        headers: { "Authorization": "Bearer " + token }
                    });
                })
                .then(function (r) { if (!r.ok) throw new Error("HTTP error: " + r.status); return r.json(); })
                .then(function (data) {
                    var match = data.objects.find(function (item) {
                        return item.object.properties["cmis:objectId"].value === folderId;
                    });
                    if (!match) throw new Error("Folder not found");
                    return match.object.properties["cmis:name"].value;
                });
        },

        uploadDMSFile: function (oFile, folderName, token) {
            var ep = this._dmsConfig.endpoints();
            var apiUrl = ep.createDocument + "/" + encodeURIComponent(folderName);

            var formData = new FormData();
            formData.append("cmisaction", "createDocument");
            formData.append("propertyId[0]", "cmis:name");
            formData.append("propertyValue[0]", oFile.name);
            formData.append("propertyId[1]", "cmis:objectTypeId");
            formData.append("propertyValue[1]", "cmis:document");
            formData.append("filename", oFile.name);
            formData.append("charset", "UTF-8");
            formData.append("includeAllowableActions", "true");
            formData.append("succinct", "true");
            formData.append("media", oFile);

            return fetch(apiUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: formData
            })
            .then(function (r) { if (!r.ok) throw new Error("Upload failed: " + r.status); return r.json(); })
            .then(function (data) {
                return {
                    objectId: data.succinctProperties && data.succinctProperties["cmis:objectId"] || "temp_id",
                    name: oFile.name
                };
            });
        },

        fetchDMSDocumentMetadata: function (objectId) {
            if (!objectId) return Promise.resolve([]);
            var ep = this._dmsConfig.endpoints();
            var url = ep.getObject + "?objectId=" + encodeURIComponent(objectId);
            var cfg = this._dmsConfig;

            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(cfg.clientId + ":" + cfg.clientSecret),
                    "Accept": "application/json"
                }
            })
            .then(function (r) { if (!r.ok) throw new Error("Metadata fetch failed: " + r.status); return r.json(); })
            .then(function (data) {
                if (!data || !data.objects || !data.objects.length) return [];
                return data.objects.map(function (doc) {
                    var props = doc.object.properties;
                    return {
                        objectId:     props["cmis:objectId"]?.value || "",
                        name:         props["cmis:name"]?.value || "Unnamed Document",
                        mimeType:     props["cmis:contentStreamMimeType"]?.value || "application/octet-stream",
                        fileName:     props["cmis:contentStreamFileName"]?.value || "download",
                        fileSize:     props["cmis:contentStreamLength"]?.value || 0,
                        creationDate: props["cmis:creationDate"]?.value || 0,
                        lastModified: props["cmis:lastModificationDate"]?.value || 0
                    };
                });
            });
        },
fetchDMSFilesFromFolder: function (sSupportingDocuments) {
    if (!sSupportingDocuments) return Promise.resolve([]);

    // Extract folder ID from "spa-res:cmis:folderid:<folderId>"
    var sFolderId = sSupportingDocuments.replace("spa-res:cmis:folderid:", "").trim();
    if (!sFolderId) return Promise.resolve([]);

    var cfg = this._dmsConfig;
    var base = cfg.baseUrl;
    var repo = cfg.repositoryId;

    // Use the Download endpoint with cmisselector=children to list folder contents
    // This is the correct CMIS endpoint for listing children of a folder
    // URL: https://.../Download/browser/{repo}/root?cmisselector=children&objectId={folderId}
    var sFolderChildrenUrl = base + "/Download/browser/" + repo + "/root"
        + "?cmisselector=children&objectId=" + encodeURIComponent(sFolderId);

    return this.getDMSToken()
        .then(function (token) {
            return fetch(sFolderChildrenUrl, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Accept": "application/json"
                }
            });
        })
        .then(function (r) {
            if (!r.ok) throw new Error("Folder children fetch failed: " + r.status);

            // Check content type before parsing as JSON
            var contentType = r.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("Response is not JSON. Content-Type: " + contentType);
            }
            return r.json();
        })
        .then(function (data) {
            console.log("Folder children raw response:", JSON.stringify(data));

            // CMIS children response format:
            // { objects: [{ object: { succinctProperties: {...} OR properties: {...} } }] }
            var aObjects = (data.objects || []);
            if (!aObjects.length) {
                console.warn("No objects found in folder:", sFolderId);
                return [];
            }

            // Take only the first/latest file
            var firstObject = aObjects[0];
            var oObject = firstObject.object || firstObject;

            // Try succinctProperties first (used when succinct=true was passed during upload)
            var succinctProps = oObject.succinctProperties;
            // Then try regular properties format
            var regularProps = oObject.properties;

            var sFileObjectId, sFileName, nFileSize, nCreationDate;

            if (succinctProps) {
                sFileObjectId = succinctProps["cmis:objectId"] || "";
                sFileName     = succinctProps["cmis:contentStreamFileName"]
                             || succinctProps["cmis:name"]
                             || "Unknown File";
                nFileSize     = succinctProps["cmis:contentStreamLength"] || 0;
                nCreationDate = succinctProps["cmis:creationDate"] || 0;

            } else if (regularProps) {
                sFileObjectId = (regularProps["cmis:objectId"] && regularProps["cmis:objectId"].value) || "";
                sFileName     = (regularProps["cmis:contentStreamFileName"] && regularProps["cmis:contentStreamFileName"].value)
                             || (regularProps["cmis:name"] && regularProps["cmis:name"].value)
                             || "Unknown File";
                nFileSize     = (regularProps["cmis:contentStreamLength"] && regularProps["cmis:contentStreamLength"].value) || 0;
                nCreationDate = (regularProps["cmis:creationDate"] && regularProps["cmis:creationDate"].value) || 0;
            } else {
                console.error("No properties found in object:", JSON.stringify(oObject));
                return [];
            }

            if (!sFileObjectId) {
                console.error("No cmis:objectId found in object properties");
                return [];
            }

            // Format file type
            var aParts = sFileName.split(".");
            var sFileType = aParts.length > 1 ? aParts[aParts.length - 1].toUpperCase() : "FILE";

            // Format file size
            var sFileSizeFormatted;
            if (nFileSize < 1024) {
                sFileSizeFormatted = nFileSize + " B";
            } else if (nFileSize < 1048576) {
                sFileSizeFormatted = Math.round(nFileSize / 1024) + " KB";
            } else {
                sFileSizeFormatted = Math.round(nFileSize / 1048576 * 10) / 10 + " MB";
            }

            // Format date
            var sUploadedOn = nCreationDate
                ? new Date(nCreationDate).toLocaleDateString()
                : new Date().toLocaleDateString();

            var aResult = [{
                objectId:   sFileObjectId,
                fileName:   sFileName,
                fileType:   sFileType,
                fileSize:   sFileSizeFormatted,
                uploadedOn: sUploadedOn,
                folderId:   sFolderId
            }];

            console.log("DMS file parsed successfully:", JSON.stringify(aResult));
            return aResult;
        })
        .catch(function (error) {
            console.error("WorkflowAPI: Error fetching DMS files from folder:", error);
            return [];
        });
},

        downloadDMSFile: function (objectId) {
            var ep = this._dmsConfig.endpoints();
            return this.getDMSToken()
                .then(function (token) {
                    return fetch(ep.getObject + "?objectId=" + objectId, {
                        method: "GET",
                        headers: { "Authorization": "Bearer " + token }
                    });
                })
                .then(function (r) { if (!r.ok) throw new Error("Download failed: " + r.statusText); return r.blob(); });
        },

        deleteDMSFile: function (objectId) {
                var ep = this._dmsConfig.endpoints();
                return this.getDMSToken()
                    .then(function (token) {
                        var formData = new FormData();
                        formData.append("cmisaction", "delete");
                        formData.append("objectId", objectId);

                        return fetch(ep.delete, {          // ← no folderName appended
                            method: "POST",
                            headers: { "Authorization": "Bearer " + token },
                            body: formData
                        });
                    })
                    .then(function (r) {
                        if (!r.ok) throw new Error("Delete failed: " + r.statusText);
                        return true;
                    });
            }
    };
});