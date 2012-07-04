(ns starwarsccg.web
  (:use [ring.adapter.jetty :only [run-jetty]])
  (:use clojure.java.io clojure-csv.core)
  (:use ring.middleware.json-params)
  (:use compojure.core
        compojure.handler
        compojure.route)
  (:require [clucy.core :as clucy])
  (:require [clj-json.core :as json]))

; The in-memory lucene index to store the card data
(def index (clucy/memory-index))

; A sequence of all the card csv files
(def data_files (filter #(.endsWith (.getName %) ".csv") (file-seq (file "data"))))

; Read the csvs and load into the clucy memory index
(defn reindex []
  (clucy/search-and-delete index "*:*")
  (let [header [:cardlist :name :type_img :desc :rarity :img_url :img_file]]
    (doseq [data_file data_files]
      (with-open [rdr (reader data_file)]
        (doseq [row (parse-csv rdr)]
          (clucy/add index
            (zipmap header row)))))))

(reindex)

; Search handler
(defn search [query limit]
  {:status 200
   :headers {"Content-Type" "application/json"}
   :body (json/generate-string {:cards (clucy/search index query (Integer. limit))})
  })

; Routing
(defroutes app
  ; static file handler
  (compojure.route/files "/" {:root "public"})

  ; search query handler
  (GET "/search*" {params :query-params}
    (search (params "q") (params "limit" 10)))

  ; reindex handler
  (POST "/reindex" []
    {:status 200
     :body (reindex)})
)

; Main
(defn -main [port]
  (run-jetty (compojure.handler/api app) {:port (Integer. port)}))
