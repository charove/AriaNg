(function () {
    'use strict';

    angular.module('ariaNg').controller('MainController', ['$rootScope', '$scope', '$route', '$location', '$document', '$interval', 'aria2RpcErrors', 'ariaNgCommonService', 'ariaNgSettingService', 'ariaNgMonitorService', 'ariaNgNotificationService', 'aria2TaskService', 'aria2SettingService', function ($rootScope, $scope, $route, $location, $document, $interval, aria2RpcErrors, ariaNgCommonService, ariaNgSettingService, ariaNgMonitorService, ariaNgNotificationService, aria2TaskService, aria2SettingService) {
        var pageTitleRefreshPromise = null;
        var globalStatRefreshPromise = null;

        var refreshPageTitle = function () {
            var context = (function (globalStat) {
                if (!globalStat) {
                    return null;
                }

                return {
                    downloadingCount: globalStat.numActive,
                    waitingCount: globalStat.numWaiting,
                    stoppedCount: globalStat.numStopped,
                    downloadSpeed: globalStat.downloadSpeed,
                    uploadSpeed: globalStat.uploadSpeed
                }
            })($scope.globalStat);

            $document[0].title = ariaNgSettingService.getFinalTitle(context);
        };

        var refreshGlobalStat = function (silent, callback) {
            return aria2SettingService.getGlobalStat(function (response) {
                if (!response.success && response.data.message == aria2RpcErrors.Unauthorized.message) {
                    $interval.cancel(globalStatRefreshPromise);
                    return;
                }

                if (response.success) {
                    $scope.globalStat = response.data;
                    ariaNgMonitorService.recordGlobalStat(response.data);
                }

                if (callback) {
                    callback(response);
                }
            }, silent);
        };

        if (ariaNgSettingService.getBrowserNotification()) {
            ariaNgNotificationService.requestBrowserPermission();
        }

        $scope.globalStatusContext = {
            data: ariaNgMonitorService.getGlobalStatsData()
        };

        $scope.isTaskSelected = function () {
            return $rootScope.taskContext.getSelectedTaskIds().length > 0;
        };

        $scope.isSpecifiedTaskSelected = function () {
            var selectedTasks = $rootScope.taskContext.getSelectedTasks();

            if (selectedTasks.length < 1) {
                return false;
            }

            for (var i = 0; i < selectedTasks.length; i++) {
                for (var j = 0; j < arguments.length; j++) {
                    if (selectedTasks[i].status == arguments[j]) {
                        return true;
                    }
                }
            }

            return false;
        };

        $scope.isSpecifiedTaskShowing = function () {
            var tasks = $rootScope.taskContext.list;

            if (tasks.length < 1) {
                return false;
            }

            for (var i = 0; i < tasks.length; i++) {
                for (var j = 0; j < arguments.length; j++) {
                    if (tasks[i].status == arguments[j]) {
                        return true;
                    }
                }
            }

            return false;
        };

        $scope.changeTasksState = function (state) {
            var gids = $rootScope.taskContext.getSelectedTaskIds();

            if (!gids || gids.length < 1) {
                return;
            }

            var invoke = null;

            if (state == 'start') {
                invoke = aria2TaskService.startTasks;
            } else if (state == 'pause') {
                invoke = aria2TaskService.pauseTasks;
            } else {
                return;
            }

            $rootScope.loadPromise = invoke(gids, function (response) {
                if (response.hasError && gids.length > 1) {
                    ariaNgCommonService.showError('Failed to change some tasks state.');
                }

                if (!response.hasSuccess) {
                    return;
                }

                refreshGlobalStat(true);

                if (!response.hasError && state == 'start') {
                    if ($location.path() == '/waiting') {
                        $location.path('/downloading');
                    } else {
                        $route.reload();
                    }
                } else if (!response.hasError && state == 'pause') {
                    if ($location.path() == '/downloading') {
                        $location.path('/waiting');
                    } else {
                        $route.reload();
                    }
                }
            }, (gids.length > 1));
        };

        $scope.removeTasks = function () {
            var tasks = $rootScope.taskContext.getSelectedTasks();

            if (!tasks || tasks.length < 1) {
                return;
            }

            ariaNgCommonService.confirm('Confirm Remove', 'Are you sure you want to remove the selected task?', 'warning', function () {
                $rootScope.loadPromise = aria2TaskService.removeTasks(tasks, function (response) {
                    if (response.hasError && tasks.length > 1) {
                        ariaNgCommonService.showError('Failed to remove some task(s).');
                    }

                    if (!response.hasSuccess) {
                        return;
                    }

                    refreshGlobalStat(true);

                    if (!response.hasError) {
                        if ($location.path() == '/stopped') {
                            $route.reload();
                        } else {
                            $location.path('/stopped');
                        }
                    }
                }, (tasks.length > 1));
            });
        };

        $scope.clearStoppedTasks = function () {
            ariaNgCommonService.confirm('Confirm Clear', 'Are you sure you want to clear stopped tasks?', 'warning', function () {
                $rootScope.loadPromise = aria2TaskService.clearStoppedTasks(function (response) {
                    if (!response.success) {
                        return;
                    }

                    refreshGlobalStat(true);

                    if ($location.path() == '/stopped') {
                        $route.reload();
                    } else {
                        $location.path('/stopped');
                    }
                });
            });
        };

        $scope.selectAllTasks = function () {
            $rootScope.taskContext.selectAll();
        };

        $scope.changeDisplayOrder = function (type, autoSetReverse) {
            var oldType = ariaNgCommonService.parseOrderType(ariaNgSettingService.getDisplayOrder());
            var newType = ariaNgCommonService.parseOrderType(type);

            if (autoSetReverse && newType.type == oldType.type) {
                newType.reverse = !oldType.reverse;
            }

            ariaNgSettingService.setDisplayOrder(newType.getValue());
        };

        $scope.isSetDisplayOrder = function (type) {
            var orderType = ariaNgCommonService.parseOrderType(ariaNgSettingService.getDisplayOrder());
            var targetType = ariaNgCommonService.parseOrderType(type);

            return orderType.equals(targetType);
        };

        if (ariaNgSettingService.getTitleRefreshInterval() > 0) {
            pageTitleRefreshPromise = $interval(function () {
                refreshPageTitle();
            }, ariaNgSettingService.getTitleRefreshInterval());
        }

        if (ariaNgSettingService.getGlobalStatRefreshInterval() > 0) {
            globalStatRefreshPromise = $interval(function () {
                refreshGlobalStat(true);
            }, ariaNgSettingService.getGlobalStatRefreshInterval());
        }

        $scope.$on('$destroy', function () {
            if (pageTitleRefreshPromise) {
                $interval.cancel(pageTitleRefreshPromise);
            }

            if (globalStatRefreshPromise) {
                $interval.cancel(globalStatRefreshPromise);
            }
        });

        refreshGlobalStat(true, function () {
            refreshPageTitle();
        });
    }]);
})();
