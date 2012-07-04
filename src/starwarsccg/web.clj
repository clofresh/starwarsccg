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

; The domain of the image urls
(def img_domain (get (System/getenv) "IMG_DOMAIN", ""))

; Read the csvs and load into the clucy memory index
(defn reindex [data_files]
  (clucy/search-and-delete index "*:*")
  (let [header [:cardlist :name :type_img :desc :rarity :img_url :img_file]]
    (doseq [data_file data_files]
      (with-open [rdr (reader data_file)]
        (doseq [row (parse-csv rdr)]
          (clucy/add index
            (zipmap header row)))))))

(reindex data_files)

; Search handler
(defn search [query limit]
  (defn concat_domain [row]
    (update-in row [:img_file] #(str img_domain %)))
  {:status 200
   :headers {"Content-Type" "application/json"}
   :body (json/generate-string {:cards
            (map concat_domain (clucy/search index query (Integer. limit)))
         })
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
     :body (reindex data_files)})
)

; Main
(defn -main [port]
  (run-jetty (compojure.handler/api app) {:port (Integer. port)}))
