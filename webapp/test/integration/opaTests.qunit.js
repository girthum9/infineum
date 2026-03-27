/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["accrual/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
