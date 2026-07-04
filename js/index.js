const SCOPE_ACTIVITY_FITNESS_READONLY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
const SCOPE_HEALTH_METRICS_READONLY = "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"

const previousDayButton = document.getElementById("previous_day_button")
const nextDayButton = document.getElementById("next_day_button")
const datePicker = document.getElementById("main_date_picker")
const goalForm = document.getElementById("goal_form")
const stepGoalInput = document.getElementById("step_goal_input")
const distanceGoalInput = document.getElementById("distance_goal_input")
const activityGoalInput = document.getElementById("activity_goal_input")
const loadFrame = document.getElementById("load_frame")
const loadLabel = loadFrame.querySelector("strong")

const stepsRadial = radialHelper(document.getElementById("steps_radial"))
const distanceRadial = radialHelper(document.getElementById("distance_radial"))
const activityRadial = radialHelper(document.getElementById("activity_radial"))
const pulseRadial = radialHelper(document.getElementById("pulse_radial"))

const reconciledData = {}
var stepGoal = localStorage.getItem("step_goal") || 10_000
var distanceGoal = localStorage.getItem("distance_goal") || 2
var activityGoal = localStorage.getItem("activity_goal") || 60

/**
 * @param {HTMLElement} radial The radial element to control
 */
function radialHelper(radial) {
	const bar = radial.querySelector(".radial-progress-bar")
	const label = radial.querySelector("h1")
	return (percent, text) => {
		bar.style.setProperty("--value", percent * 100)
		label.innerHTML = text
	}
}

/**
 * Converts a Date object into a Google Date
 * @param {Date} date The date to convert
 */
function getCivilDate(date) {
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate()
	}
}

/**
 * Converts two Date objects into a Google CivilTimeInterval
 * @param {Date} start The starting Date
 * @param {Date} end The ending Date
 */
function getCivilTimeInterval(start, end) {
	return {
		start: { date: getCivilDate(start) },
		end: { date: getCivilDate(end) }
	}
}

/**
 * Creates a Google CivilTimeInterval from a Date Pivot and an offset in days
 * @param {Date} a The Date pivot
 * @param {number} count The number of days to offset. Can be negative
 */
function getDayInterval(a, count) {
	if (count > 0) {
		return {
			start: { date: getCivilDate(a) },
			end: { date: getCivilDate(new Date(a.getTime() + count * 86400000)), time: { hours: 23, minutes: 59 } }
		}
	} else {
		return {
			start: { date: getCivilDate(new Date(a.getTime() + count * 86400000)) },
			end: { date: getCivilDate(a), time: { hours: 23, minutes: 59 } }
		}
	}
}

/**
 * Gets and reconciles daily rollup data
 * @param {Date} a The desired Date
 * @param {number} count The number of days to offset. Can be negative
 * @returns {Promise}
 */
function getDataAndReconcile(a, count) {
	const batch = gapi.client.newBatch()
	const resource = {
		range: getDayInterval(new Date(), count)
	}

	for (let i = 0; i < Math.abs(count); i++) {
		reconciledData[dateToKey(new Date(a.getTime() + Math.sign(count) * i * 86400000))] = { }
	}

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/steps",
		resource
	}), { id: "steps" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/distance",
		resource
	}), { id: "distance" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/active-zone-minutes",
		resource
	}), { id: "activity" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/heart-rate",
		resource
	}), { id: "heartrate" })

	return batch.then((response) => {
		const results = response.result
		if (!results) return

		results.steps.result?.rollupDataPoints?.forEach((data) => {
			const key = `${data.civilStartTime.date.year}-${data.civilStartTime.date.month}-${data.civilStartTime.date.day}`
			if (!reconciledData[key]) {
				reconciledData[key] = {}
			}

			reconciledData[key].steps = data.steps
		})

		results.distance.result?.rollupDataPoints?.forEach((data) => {
			const key = `${data.civilStartTime.date.year}-${data.civilStartTime.date.month}-${data.civilStartTime.date.day}`
			if (!reconciledData[key]) {
				reconciledData[key] = {}
			}

			reconciledData[key].distance = data.distance
		})

		results.activity.result?.rollupDataPoints?.forEach((data) => {
			const key = `${data.civilStartTime.date.year}-${data.civilStartTime.date.month}-${data.civilStartTime.date.day}`
			if (!reconciledData[key]) {
				reconciledData[key] = {}
			}

			reconciledData[key].activity = data.activeZoneMinutes
		})

		results.heartrate.result?.rollupDataPoints?.forEach((data) => {
			const key = `${data.civilStartTime.date.year}-${data.civilStartTime.date.month}-${data.civilStartTime.date.day}`
			if (!reconciledData[key]) {
				reconciledData[key] = {}
			}

			reconciledData[key].heartrate = data.heartRate
		})
	}).catch((error) => {
		console.error(error)
	})
}

/**
 * 
 * @param {Date} date The Date to convert to a string
 */
function dateToKey(date) {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * 
 * @param {Date} date The Date to show Data for
 * @param {number} count A day buffer
 */
async function showDataForDate(date, count = 0) {
	previousDayButton.disabled = true
	nextDayButton.disabled = true
	loadFrame.style.visibility = "visible"

	const key = dateToKey(date)
	if (!reconciledData[key]) {
		await getDataAndReconcile(date, count)
	}

	const results = reconciledData[key]
	let data

	if (data = results?.steps) {
		stepsRadial(Math.min(data.countSum / stepGoal, 1), data.countSum)
	} else {
		stepsRadial(0, "0")
	}

	if (data = results?.distance) {
		const mm = parseInt(data.millimetersSum) * 0.001
		if (mm >= 1000) {
			distanceRadial(Math.min((mm * 0.001) / distanceGoal, 1), (mm * 0.001).toFixed(2) + ` <small style="font-size: 1rem;">km</small>`)
		} else {
			distanceRadial(Math.min((mm * 0.001) / distanceGoal, 1), mm + ` <small style="font-size: 1rem;">m</small>`)
		}
	} else {
		distanceRadial(0, `0 <small style="font-size: 1rem;">m</small>`)
	}

	if (data = results?.activity) {
		const min = parseInt(data.sumInCardioHeartZone) + parseInt(data.sumInPeakHeartZone) + parseInt(data.sumInFatBurnHeartZone)
		activityRadial(Math.min(min / activityGoal, 1), min + ` <small style="font-size: 1rem;">min</small>`)
	} else {
		activityRadial(0, "N/A")
	}

	if (data = results?.heartrate) {
		pulseRadial(data.beatsPerMinuteAvg / 250, data.beatsPerMinuteMin + " - " + data.beatsPerMinuteMax)
	} else {
		pulseRadial(0, "N/A")
	}

	previousDayButton.disabled = false
	nextDayButton.disabled = false
	loadFrame.style.visibility = "hidden"
}

datePicker.valueAsNumber = Date.now()
datePicker.onchange = () => {
	if (!datePicker.valueAsDate) {
		datePicker.valueAsNumber = Date.now()
	}
	showDataForDate(datePicker.valueAsDate, -7)
}
previousDayButton.onclick = () => {
	datePicker.valueAsNumber -= 86400000
	showDataForDate(datePicker.valueAsDate, -7)
}
nextDayButton.onclick = () => {
	datePicker.valueAsNumber += 86400000
	showDataForDate(datePicker.valueAsDate, 7)
}

stepGoalInput.value = stepGoal
distanceGoalInput.value = distanceGoal
activityGoalInput.value = activityGoal

goalForm.onsubmit = () => {
	stepGoal = stepGoalInput.value || 10_000
	distanceGoal = distanceGoalInput.value || 2
	activityGoal = activityGoalInput.value || 60
	localStorage.setItem("step_goal", stepGoal)
	localStorage.setItem("distance_goal", distanceGoal)
	localStorage.setItem("activity_goal", activityGoal)
	goalForm.parentElement.classList.remove("show")
	showDataForDate(datePicker.valueAsDate, 0)
}

window.onload = () => {
	gapi.load("client", async () => {
		const token = localStorage.getItem("access_token")
		const exp = localStorage.getItem("exp")

		if (token && exp && exp > Date.now()) {
			gapi.client.setToken({
				access_token: token
			})

			await gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
			showDataForDate(datePicker.valueAsDate, -7)
		} else {
			const modal = new bootstrap.Modal('#signin_model')
			const signinButton = document.getElementById("signin_button")
			const tokenClient = google.accounts.oauth2.initTokenClient({
				client_id: "630310444486-1qlt8f3u2n35rglmtjbuc6vkcstavihh.apps.googleusercontent.com",
				scope: SCOPE_ACTIVITY_FITNESS_READONLY + " " + SCOPE_HEALTH_METRICS_READONLY,
				prompt: "",
				callback: (tokenResponse) => {
					if (!tokenResponse?.access_token) {
						console.warn("No token response provided")
						signinButton.disabled = false
						signinButton.children[0].hidden = true
						signinButton.children[1].innerText = "Sign In"
						return
					}

					if (!google.accounts.oauth2.hasGrantedAllScopes(tokenResponse, SCOPE_ACTIVITY_FITNESS_READONLY, SCOPE_HEALTH_METRICS_READONLY)) {
						console.warn("Desired scopes have not been granted")
						signinButton.disabled = false
						signinButton.children[0].hidden = true
						signinButton.children[1].innerText = "Sign In"
						return
					}

					localStorage.setItem("access_token", tokenResponse.access_token)
					localStorage.setItem("exp", Date.now() + tokenResponse.expires_in * 1000)
					modal.hide()
					showDataForDate(datePicker.valueAsDate, -7)
				}
			})

			signinButton.onclick = () => {
				signinButton.disabled = true
				signinButton.children[0].hidden = false
				signinButton.children[1].innerText = "Signing In..."
				tokenClient.requestAccessToken()
			}

			gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
			modal.show()
		}
	})
}